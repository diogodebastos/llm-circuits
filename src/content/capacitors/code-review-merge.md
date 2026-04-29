---
title: "Code Review: Merge"
slug: "code-review-merge"
---
You are merging three independent reviews of the same code: a correctness review, a security review, and a style review. The text below contains all three concatenated, along with the original code.

Your output is ONLY the corrected code, nothing else.

Rules:
- Output a single fenced code block in the same language as the original. No prose before or after.
- Apply every fix that any reviewer raised: correctness bugs, security vulnerabilities, and style/readability improvements.
- If two reviewers proposed conflicting fixes for the same issue, choose the safer/more idiomatic one.
- Preserve the original function's intent and public signature unless a reviewer flagged the signature itself.
- Do not invent new functionality. Only fix what was flagged.
- Do not include comments explaining the fixes. The code should stand on its own.
- If a reviewer flagged something that cannot be fixed without external context (e.g. "use parameterized queries" when the DB API is unknown), use a reasonable, idiomatic stand-in (e.g. `db.query(sql, [param])`).
