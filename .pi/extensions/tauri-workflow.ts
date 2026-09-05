/**
 * Tauri Workflow Extension (project-local)
 *
 * 为 Hermit / clip-reader（Tauri 2 项目）提供常用开发命令封装：
 * - /tauri status   : 快速诊断（node/rust 版本、devUrl 端口一致性、git 状态）
 * - /tauri check    : Rust cargo check
 * - /tauri dev      : 启动开发（需另开终端，这里提示命令）
 * - /tauri build    : 打包（耗时较长，默认拦截，需确认）
 * - /tauri info     : tauri info 完整诊断
 *
 * 安装位置: .pi/extensions/tauri-workflow.ts (项目级，需项目已信任)
 * 参考: examples/extensions/commands.ts（registerCommand 用法）
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ROOT_CMD = "cd /Users/hanwei/Desktop/Hermit &&";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("tauri", {
		description: "Tauri 2 开发工作流（status/check/dev/build/info）",
		handler: async (args, ctx) => {
			const sub = (args || "status").trim().split(/\s+/)[0];

			// 非交互模式只做只读操作，build 需交互确认
			switch (sub) {
				case "check": {
					const { stdout, code } = await pi.exec("bash", ["-lc", `${ROOT_CMD} cd src-tauri && cargo check 2>&1 | tail -25`]);
					if (code !== 0) {
						ctx.ui.notify(`cargo check 失败（exit ${code}）`, "error");
					} else {
						ctx.ui.notify("cargo check 通过", "info");
					}
					// stdout 已含在会话输出里
					console.log(stdout);
					return;
				}
				case "dev":
				case "build": {
					if (sub === "build" && ctx.hasUI) {
						const ok = await ctx.ui.confirm("执行 tauri build", "打包耗时较长，确认开始？");
						if (!ok) {
							ctx.ui.notify("已取消", "info");
							return;
						}
					}
					// dev/build 需长时前台运行，交给用户另开终端执行
					const cmd = sub === "dev" ? "npm run tauri dev" : "npm run tauri build";
					ctx.ui.notify(`请在终端执行: cd /Users/hanwei/Desktop/Hermit && ${cmd}`, "info");
					console.log(`>>> ${cmd}`);
					return;
				}
				case "info": {
					const { stdout } = await pi.exec("bash", ["-lc", `${ROOT_CMD} npm run tauri -- info 2>&1 | head -40`]);
					console.log(stdout);
					return;
				}
				case "status":
				default: {
					const lines: string[] = [];
					const ver = async (c: string) => {
						const r = await pi.exec("bash", ["-lc", `${ROOT_CMD} ${c}`]).catch(() => ({ stdout: "?" }));
						return r.stdout.trim().split("\n")[0];
					};
					lines.push(`node: ${await ver("node -v")}`);
					lines.push(`rust: ${await ver("rustc --version")}`);
					lines.push(`tauri-cli: ${await ver("npm run tauri -- --version")}`);
					// devUrl 端口
					const conf = await pi.exec("cat", ["/Users/hanwei/Desktop/Hermit/src-tauri/tauri.conf.json"]).catch(() => ({ stdout: "" }));
					const m = conf.stdout.match(/devUrl["':\s]+["'](http:\/\/localhost:\d+)/);
					lines.push(`devUrl: ${m ? m[1] : "(未找到)"}`);
					// git 状态
					const g = await pi.exec("git", ["status", "--porcelain"], { cwd: "/Users/hanwei/Desktop/Hermit" }).catch(() => ({ stdout: "" }));
					const dirty = g.stdout.trim().split("\n").filter(Boolean).length;
					lines.push(`git: ${dirty ? `${dirty} 个未提交改动` : "干净"}`);
					console.log(lines.join("\n"));
					return;
				}
			}
		},
	});

	// 状态栏提示：Tauri 开发端口
	pi.on("session_start", async (_e, ctx) => {
		if (!ctx.hasUI) return;
		// 短暂展示一次即可，避免常驻刷屏
		ctx.ui.notify("Hermit (Tauri 2 + React 19)：可用 /tauri status|check|dev|build|info", "info");
	});
}
