const repo = process.env.GITHUB_REPOSITORY;
async function api(path, method = 'GET') {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { method, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`Artifact API ${r.status}`);
  return r.status === 204 ? null : r.json();
}
let artifacts = [];
for (let page = 1; ; page++) {
  const data = await api(`/actions/artifacts?per_page=100&page=${page}`);
  artifacts.push(...data.artifacts); if (data.artifacts.length < 100) break;
}
const backups = artifacts.filter(a => a.name.startsWith('dragonage-full-') && !a.expired).sort((a,b) => b.id - a.id);
for (const artifact of backups.slice(4)) { await api(`/actions/artifacts/${artifact.id}`, 'DELETE'); console.log(`Removed old backup ${artifact.id}`); }
console.log(`Retained ${Math.min(backups.length, 4)} backups`);
