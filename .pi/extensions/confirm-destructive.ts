/**
 * Confirm Destructive Extension (project-local)
 *
 * 为 Hermit / clip-reader 项目提供危险操作确认与关键路径保护：
 * - bash 里出现破坏性命令（rm -rf / 强制删除 / git reset --hard / git clean -f / 覆盖 push -f）
 *   时先弹确认，非交互模式默认拦截。
 * - 保护 vendor/foliate-js（第三方阅读内核）、.pi/ 配置、package-lock.json、Cargo.lock：
 *   删除/覆盖这些路径前必须确认，避免误伤。
 * - 拦截对整棵 node_modules 的 rm -rf（应改用 npm 命令）。
 *
 * 安装位置: .pi/extensions/confirm-destructive.ts (项目级，需项目已信任)
 * 参考: examples/extensions/confirm-destructive.ts、dirty-repo-guard.ts
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const PROTECTED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /(^|\s)rm\s+(-[a-z]*[rf][a-z]*\s+)+/i, reason: "rm -rf / 强制递归删除" },
	{ pattern: /\bgit\s+reset\s+--hard\b/, reason: "git reset --hard（丢弃改动）" },
	{ pattern: /\bgit\s+clean\s+(-[a-z]*f|--force)\b/, reason: "git clean -f（删除未跟踪文件）" },
	{ pattern: /\bgit\s+push\s+(-f|--force)\b/, reason: "git push 强推（覆盖远端）" },
	{ pattern: /\brm\s+(-[a-z]*r[a-z]*)?.*node_modules/, reason: "直接删 node_modules（应改用 npm 命令）" },
];

const PROTECTED_PATHS = [
	"vendor/foliate-js", // 第三方阅读内核（file: 依赖），误删/误改代价大
	".pi/", // pi 的项目级配置（本扩展所在目录）
	"package-lock.json",
	"Cargo.lock",
];

function pathIsProtected(path: string): string | undefined {
	const norm = path.replace(/\\/g, "/");
	return PROTECTED_PATHS.find((p) => norm === p || norm.startsWith(p) || norm.includes(`/${p}`));
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		// 只处理 bash 与 file 工具
		if (isToolCallEventType("bash", event)) {
			const cmd = event.input.command ?? "";
			for (const { pattern, reason } of PROTECTED_PATTERNS) {
				if (pattern.test(cmd)) {
					if (!ctx.hasUI) {
						// 非交互（headless）默认拦截，防止无人值守误伤
						return { block: true, reason: `危险命令（${reason}）：${cmd.slice(0, 120)}` };
					}
					const ok = await ctx.ui.confirm("确认危险命令", `${reason}\n\n命令：\n${cmd}\n\n是否执行？`);
					if (!ok) {
						ctx.ui.notify("已取消执行", "warning");
						return { block: true, reason: `用户取消了危险命令（${reason}）` };
					}
					break; // 用户确认过就不重复拦
				}
			}
			return;
		}

		// write / edit 涉及受保护路径时确认
		if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
			const p = pathIsProtected(String(event.input.path ?? ""));
			if (!p) return;
			if (!ctx.hasUI) {
				return { block: true, reason: `受保护路径 ${p}，非交互模式默认禁止写入` };
			}
			const ok = await ctx.ui.confirm("受保护文件", `路径 ${p} 是本项目关键文件，确定修改？`);
			if (!ok) {
				ctx.ui.notify("已取消修改", "warning");
				return { block: true, reason: `用户取消了修改受保护路径 ${p}` };
			}
		}
	});
}
