const DEFAULT_MAX_FILE_SIZE_MB = 8;

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Missing environment variable: ${name}`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}

function getAllowedOrigin(req) {
  const configured = (process.env.ALLOWED_ORIGIN || "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const requestOrigin = req.headers.origin || "";

  if (configured.includes("*")) return "*";
  if (requestOrigin && configured.includes(requestOrigin)) return requestOrigin;
  if (!requestOrigin && configured.includes("null")) return "null";
  return configured[0] || "*";
}

function setCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", getAllowedOrigin(req));
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Password");
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readRequestBody(req) {
  if (req.body) {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function normalizePath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function isAllowedImagePath(path) {
  const match = path.match(/^images\/(A-GY25302US|C-GY25302US)(?:\/A\+)?\/(\d+)\.jpg$/);
  if (!match) return false;

  const product = match[1];
  const number = Number(match[2]);
  const isAplus = path.includes("/A+/");

  if (isAplus) return number >= 1 && number <= 18;
  if (product === "A-GY25302US") return number >= 1 && number <= 10;
  if (product === "C-GY25302US") return number >= 1 && number <= 10;
  return false;
}

function encodeRepoPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function validateImageBody(body) {
  const path = normalizePath(body.path);
  const contentBase64 = String(body.contentBase64 || "");

  if (!isAllowedImagePath(path)) {
    throw httpError(400, "The file path is not allowed.");
  }

  if (!contentBase64) {
    throw httpError(400, "Missing image content.");
  }

  const bytes = Buffer.from(contentBase64, "base64");
  if (!bytes.length) {
    throw httpError(400, "Invalid image content.");
  }

  const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || DEFAULT_MAX_FILE_SIZE_MB);
  const maxBytes = maxFileSizeMb * 1024 * 1024;
  if (bytes.length > maxBytes) {
    throw httpError(413, `Image is larger than ${maxFileSizeMb} MB.`);
  }

  return {
    path,
    contentBase64: bytes.toString("base64")
  };
}

async function getExistingFileSha({ owner, repo, branch, path, token }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "miao-ai-image-admin"
    }
  });

  if (response.status === 404) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(response.status, data.message || "Failed to read the existing GitHub file.");
  }

  return data.sha || null;
}

async function writeGithubFile({ owner, repo, branch, path, contentBase64, token }) {
  const sha = await getExistingFileSha({ owner, repo, branch, path, token });
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}`;
  const body = {
    message: `Update ${path}`,
    branch,
    content: contentBase64
  };

  if (sha) body.sha = sha;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "miao-ai-image-admin"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(response.status, data.message || "Failed to write the GitHub file.");
  }

  return data;
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  try {
    const adminPassword = getRequiredEnv("ADMIN_PASSWORD");
    const requestPassword = req.headers["x-admin-password"];
    if (!requestPassword || requestPassword !== adminPassword) {
      throw httpError(401, "Wrong admin password.");
    }

    const token = getRequiredEnv("GITHUB_TOKEN");
    const owner = process.env.GITHUB_OWNER || "yingo1";
    const repo = process.env.GITHUB_REPO || "miao-ai";
    const branch = process.env.GITHUB_BRANCH || "main";
    const body = await readRequestBody(req);
    const image = validateImageBody(body);
    const result = await writeGithubFile({
      owner,
      repo,
      branch,
      path: image.path,
      contentBase64: image.contentBase64,
      token
    });

    res.status(200).json({
      ok: true,
      path: image.path,
      commitSha: result.commit && result.commit.sha
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message || "Upload failed."
    });
  }
};
