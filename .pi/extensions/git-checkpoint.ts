/**
 * Git Checkpoint Extension (project-local)
 *
 * 为 Hermit / clip-reader 项目提供 git 检查点能力：
 * - 每次 LLM turn 开始前自动 `git stash create` 生成一个隐形快照，绑定到当前 entry。
 * - 在 /fork 分支或 /tree 跳转时，若该 entry 有检查点，询问是否恢复代码到该时刻。
 * - agent 跑完后自动清理检查点 map。
 *
 * 安装位置: .pi/extensions/git-checkpoint.ts (项目级，需项目已信任)
 * 参考: examples/extensions/git-checkpoint.ts
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const checkpoints = new Map<string, string>();
	let currentEntryId: string | undefined;

	// 记录最新叶子 entry id（用户消息/工具结果都会推进）
	pi.on("tool_result", async (_event, ctx) => {
		const leaf = ctx.sessionManager.getLeafEntry();
		if (leaf) currentEntryId = leaf.id;
	});

	// LLM 动手改代码前，创建一个 git 隐形 stash 快照
	pi.on("turn_start", async () => {
		// 非 git 仓库时跳过（stash create 会失败）
		const { code } = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"]).catch(() => ({
			code: 1,
			stdout: "",
			stderr: "",
		}));
		if (code !== 0) return;

		const { stdout } = await pi.exec("git", ["stash", "create"]);
		const ref = stdout.trim();
		if (ref && currentEntryId) {
			checkpoints.set(currentEntryId, ref);
		}
	});

	// /fork 时提供恢复选项
	pi.on("session_before_fork", async (event, ctx) => {
		const ref = checkpoints.get(event.entryId);
		if (!ref) return;
		if (!ctx.hasUI) return; // 非交互模式不自动恢复

		const choice = await ctx.ui.select("检测到该节点的代码检查点，恢复代码？", [
			"Yes, restore code to that point",
			"No, keep current code",
		]);
		if (choice?.startsWith("Yes")) {
			await pi.exec("git", ["stash", "apply", ref]);
			ctx.ui.notify("代码已恢复到该检查点", "info");
		}
	});

	// 本轮 agent 结束，清理检查点
	pi.on("agent_settled", async () => {
		checkpoints.clear();
		currentEntryId = undefined;
	});
}
