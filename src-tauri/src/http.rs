use std::collections::HashMap;
use base64::Engine;

/// 前端发起的 HTTP 请求（经 Rust 执行，绕过浏览器 CORS）
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DavRequest {
    /// 完整 URL（含协议与路径）
    pub url: String,
    /// HTTP 方法（GET / PROPFIND / MKCOL / PUT …）
    pub method: String,
    /// 请求头（全部以小写 key 传入）
    #[serde(default)]
    pub headers: HashMap<String, String>,
    /// 请求体内容
    #[serde(default)]
    pub body: Option<String>,
    /// 请求体编码：text（按 UTF-8 文本发送）| base64（先 base64 解码再发送）| 缺省 = 无 body
    #[serde(default)]
    pub body_encoding: Option<String>,
    /// 连接/读超时（毫秒），默认 15000
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

/// 响应：状态行 + 响应头 + base64 编码的响应体
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DavResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body_base64: Option<String>,
}

fn build_client(timeout_ms: Option<u64>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        // WebDAV 服务器多为自签名 / 内网 http，这里不校验证书由用户自行确认；
        // 若需严格校验，可改为默认行为。
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .user_agent("Hermit/0.1");
    if let Some(t) = timeout_ms {
        builder = builder.timeout(std::time::Duration::from_millis(t));
    }
    builder.build().map_err(|e| format!("初始化 HTTP 客户端失败：{e}"))
}

fn parse_body(req: &DavRequest) -> Result<Option<reqwest::Body>, String> {
    let Some(body) = &req.body else { return Ok(None) };
    match req.body_encoding.as_deref() {
        None | Some("") => Ok(None),
        Some("text") => Ok(Some(body.clone().into())),
        Some("base64") => {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(body)
                .map_err(|e| format!("请求体 base64 解码失败：{e}"))?;
            Ok(Some(bytes.into()))
        }
        Some(other) => Err(format!("未知的请求体编码：{other}")),
    }
}

/// 执行一次 WebDAV/HTTP 请求。成功拿到 HTTP 响应即返回（无论状态码）；
/// 网络层错误返回 Err。
pub async fn run_dav_request(req: DavRequest) -> Result<DavResponse, String> {
    let client = build_client(req.timeout_ms)?;
    let mut rb = client
        .request(
            reqwest::Method::from_bytes(req.method.as_bytes())
                .map_err(|_| format!("非法 HTTP 方法：{}", req.method))?,
            &req.url,
        )
        .header(reqwest::header::ACCEPT, "*/*");

    // 逐项写入自定义头（调用方需自行给出 Content-Type / Depth 等）
    for (k, v) in &req.headers {
        let name = reqwest::header::HeaderName::from_bytes(k.as_bytes())
            .map_err(|_| format!("非法请求头名：{k}"))?;
        let val = reqwest::header::HeaderValue::from_str(v)
            .map_err(|_| format!("非法请求头值：{v}"))?;
        rb = rb.header(name, val);
    }

    if let Some(b) = parse_body(&req)? {
        rb = rb.body(b);
    }

    let res = rb.send().await.map_err(|e| {
        if e.is_timeout() {
            "连接超时，请检查服务器地址与网络".to_string()
        } else if e.is_connect() {
            "无法连接服务器（请检查地址与网络）".to_string()
        } else {
            format!("网络错误：{e}")
        }
    })?;

    let status = res.status().as_u16();
    let status_text = res
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let mut headers: HashMap<String, String> = HashMap::new();
    for (k, v) in res.headers() {
        if let Ok(vs) = v.to_str() {
            headers.insert(k.as_str().to_lowercase(), vs.to_string());
        }
    }

    let bytes = res.bytes().await.map_err(|e| format!("读取响应失败：{e}"))?;
    let body_base64 = if bytes.is_empty() {
        None
    } else {
        Some(base64::engine::general_purpose::STANDARD.encode(bytes))
    };

    Ok(DavResponse {
        status,
        status_text,
        headers,
        body_base64,
    })
}

/// Tauri command 包装：把 req 的路径参数传给 run_dav_request
#[tauri::command]
pub async fn http_request(req: DavRequest) -> Result<DavResponse, String> {
    log::info!(
        "http_request: {} {} ({} headers)",
        req.method,
        req.url,
        req.headers.len()
    );
    run_dav_request(req).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_real_webdav() {
        // 真实连通性验证（可选）：设置 WEBDAV_TEST_URL / WEBDAV_TEST_AUTH 后运行
        let Ok(url) = std::env::var("WEBDAV_TEST_URL") else {
            eprintln!("跳过：未设置 WEBDAV_TEST_URL");
            return;
        };
        let auth = std::env::var("WEBDAV_TEST_AUTH")
            .unwrap_or_else(|_| base64::engine::general_purpose::STANDARD.encode(":"));
        let req = DavRequest {
            url,
            method: "PROPFIND".to_string(),
            headers: HashMap::from([
                ("authorization".to_string(), format!("Basic {auth}")),
                ("depth".to_string(), "0".to_string()),
                ("content-type".to_string(), "application/xml".to_string()),
            ]),
            body: Some(r#"<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>"#.to_string()),
            body_encoding: Some("text".to_string()),
            timeout_ms: Some(8000),
        };
        let res = run_dav_request(req).await;
        assert!(res.is_ok(), "请求应成功连通，实际：{:?}", res);
        let r = res.unwrap();
        assert_eq!(r.status, 207, "期望 Multi-Status，实际 {}", r.status);
    }
}
