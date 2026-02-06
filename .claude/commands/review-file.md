Review the changes in $ARGUMENTS from a product perspective.

Instructions:
1. Run `git diff main -- $ARGUMENTS` to see all changes in this file compared to main (this includes both committed branch changes and uncommitted work)
2. Read the full current file to understand the broader context
3. Use subagents (Task tool with Explore agent) to investigate the codebase - understand what product flows these changes affect, how the changed code is used by other parts of the system, and what the user-facing behavior looks like
4. Take as much time as you need - accuracy matters more than speed. Spin up multiple subagents in parallel to explore different parts of the codebase

Scope: You are reviewing ONLY what changed in this file between main and the current working state (the PR diff + any uncommitted work). Do not review unchanged code unless it's relevant to understanding the changes.

Your job is to identify every product problem or new feature these changes address, and evaluate whether each one is actually solved.

Format your response as:

## Product Problems & Features

List every product problem fixed or new feature added by the changes in this file. For each item:

### [number]. [Short title in user-facing terms]
- **Type**: Bug Fix / New Feature / Improvement / Refactor
- **What the user experiences**: describe the problem or feature from the user's perspective
- **How the code changes solve it**: connect the specific diff hunks to the product outcome - what changed and why that fixes/enables the thing
- **Confidence**: High / Medium / Low
- **If not High**: explain what might still be broken, what edge cases are missed, or why the approach might not fully solve it

## Issues Found
Only include this section if you actually find problems. For each:
- Dead code, unused imports, unreachable branches
- Logic that doesn't make sense or contradicts itself
- Duplicated code that already exists elsewhere in the codebase
- Potential bugs or regressions introduced by these changes

For each issue, explain concretely what's wrong and what the impact is.
