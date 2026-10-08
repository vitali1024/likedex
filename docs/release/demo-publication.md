# Browser-playable demo — manual publication checkpoint

Status 2026-10-08: the corrected tester ZIP is [published as a prerelease](https://github.com/vitali1024/likedex/releases/tag/capstone-preview-2026-10-08-2), with downloaded hashes verified. The unchanged MP4 remains on the earlier prerelease, avoiding a duplicate asset. **The required browser player is not yet published.** A Release asset alone does not meet that requirement.

Primary destination: [existing capstone PR #38](https://github.com/koldovsky/2026-agentic-engineering-crash-course-capstone/pull/38). It remains open and unmerged. GitHub CLI **2.100.0** includes `gh pr edit --body-file … --attach …` and documents video rendering. The single native upload attempt failed with `attaching files requires write access to the repository`. It did not update the body or produce an attachment URL. No permission bypass or duplicate upload was attempted. [Official CLI documentation](https://cli.github.com/manual/gh_pr_edit), [web attachment instructions](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files).

## Exact human web-editor upload

1. Sign in as PR author **vitali1024** and open PR #38. In the first PR description, choose its three-dot menu → **Edit**. Use the description, not a new comment.
2. Find **Відеодемонстрація Likedex**. Keep the cursor in a separate empty paragraph directly below that heading/short duration note. Remove the pending-upload note at that location.
3. Drag **`C:\Dev\likedex-demo\final\likedex-demo.mp4`** into that paragraph, or click the editor's **Attach files** control and select that exact original file. It is **5,464,198 bytes**, below the documented 10MB video limit for free repositories.
4. Wait for the upload to finish and for GitHub to insert the attachment URL. Keep that generated URL in its **own Markdown paragraph**, with blank lines before and after. Do not turn it into an ordinary labeled Markdown link or substitute the optional Release download URL.
5. Click **Preview** and confirm an inline player appears below the Ukrainian heading. Save with **Update comment**. Leave PR #38 open; do not merge it. Upload only once.
6. Provide the resulting native attachment URL or confirmation that the body was saved, so the agent can verify the public player and finalize the README watch links using the actual rendered section permalink.

The locally prepared body is `C:\Dev\likedex\.output\capstone-pr-manual.md`; after the agent's metadata update, editing the existing video section in place is sufficient. Do not replace newer PR text with an older saved draft.

## Playback verification after upload

Open PR #38 signed out in an incognito/private window. Confirm an inline player, click Play, and confirm moving video starts without a download prompt. Unmute and listen to the **Ukrainian narration**. Seek forward (about 40s) and backward (about 10s); verify playback and audio continue. Confirm about **1:09** displayed duration; original exact duration is **68.833333 seconds**. Confirm both PR and video are public without GitHub authentication.

The agent already opened the public PR signed out and observed its Sign in link. That confirms PR access only. Upload/API success, H.264/AAC metadata or an HTTP 200 do not prove browser playback, narration audibility or seeking. All player checks remain pending until the human upload. The tool cannot accept audio input; a human listening checkpoint may still be required even after browser decoding is verified.

Once verified, product and submission README primary **Watch demo / Переглянути демонстрацію** links must lead to the actual browser player section. The optional [Download MP4 / Завантажити MP4](https://github.com/vitali1024/likedex/releases/download/capstone-preview-2026-10-08/likedex-demo.mp4) remains separate.

If native web upload/playback also fails, report that result. YouTube Unlisted is the permitted alternative only after the human explicitly authorizes the intended YouTube account. Human upload steps: choose that account in YouTube Studio → Create → Upload videos → select the original MP4 → complete required details → set visibility **Unlisted** → save → provide its real watch URL. Do not invent a URL, upload to an assumed account or claim that alternative is already authorized.

## Integrity and scope

Original MP4 SHA-256: `3AC227EA76C01621F7B5A8E542377BB11DBA4FC0AFD7F0E9A85C64844A906F6F`; 1920×1080, H.264, 30 FPS, AAC. Full FFmpeg decode succeeded. Published/downloaded MP4 matches the local original. No re-encoding, editing, video Git commit or change to the local recording/narration artifacts occurred. The human reports prior complete technical/visual QC; fresh inspection sampled the whole timeline at one-second intervals and is not relabeled as a fresh every-frame or listening review. The video's embedded earlier evidence-plan text is a historical recording, superseded by current written checker evidence.
