'use strict';

const GH_API = 'https://api.github.com';

function ghFetch(pat, path, opts = {}) {
  return fetch(`${GH_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function createPR({ pat, owner, repo, filePath, fixedContent, branchName, prTitle, prBody }) {
  // 1. Get SHA of main branch HEAD
  const refRes = await ghFetch(pat, `/repos/${owner}/${repo}/git/ref/heads/main`);
  if (!refRes.ok) throw new Error(`Could not get main branch: ${refRes.status} ${await refRes.text()}`);
  const { object: { sha: mainSha } } = await refRes.json();

  // 2. Create fix branch
  const branchRes = await ghFetch(pat, `/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${branchName}`, sha: mainSha },
  });
  if (!branchRes.ok) {
    const err = await branchRes.text();
    if (!err.includes('already exists')) throw new Error(`Create branch failed: ${err}`);
  }

  // 3. Get current file SHA on the fix branch (needed for PUT)
  const fileRes = await ghFetch(pat, `/repos/${owner}/${repo}/contents/${filePath}?ref=${branchName}`);
  let fileSha = null;
  if (fileRes.ok) {
    const fd = await fileRes.json();
    fileSha = fd.sha;
  }

  // 4. Commit the fix
  const content = Buffer.from(fixedContent, 'utf8').toString('base64');
  const commitBody = {
    message: prTitle,
    content,
    branch: branchName,
    ...(fileSha ? { sha: fileSha } : {}),
  };
  const commitRes = await ghFetch(pat, `/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    body: commitBody,
  });
  if (!commitRes.ok) throw new Error(`Commit failed: ${await commitRes.text()}`);

  // 5. Open PR
  const prRes = await ghFetch(pat, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: { title: prTitle, body: prBody, head: branchName, base: 'main' },
  });
  if (!prRes.ok) throw new Error(`PR creation failed: ${await prRes.text()}`);
  const pr = await prRes.json();
  return { prUrl: pr.html_url, prNumber: pr.number, branch: branchName };
}

module.exports = { createPR };
