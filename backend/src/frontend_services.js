const express = require("express");
const router = express.Router();
const pool = require("./db");
const minioClient = require("./minio");

router.use(express.json());

router.get("/commits", async (req, res) => {
  const name = req.query.id;
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Missing module id." });
  }

  try {
    const commits = await pool.query(
      `SELECT DISTINCT c.id AS commit_hash, c.timestamp, c.commit_by,
              (c.id = m.last_touched_commit_hash) AS is_current
       FROM modules m
       JOIN files current_file ON current_file.id = m.file_id
       JOIN files version_file ON version_file.filename = current_file.filename
       JOIN commits c ON c.id = version_file.hash
       WHERE m.name = $1
       ORDER BY is_current DESC, c.timestamp DESC, c.id DESC`,
      [name],
    );
    res.json(commits.rows);
  } catch (err) {
    console.error("Error fetching module commits:", err);
    res.status(500).json({ error: "Failed to fetch module commits." });
  }
});

router.get("/module", async (req, res) => {
  const { name, commit } = req.query;
  if (
    typeof name !== "string" || !name.trim() ||
    typeof commit !== "string" || !commit.trim()
  ) {
    return res.status(400).json({ error: "Missing name or commit parameters." });
  }

  try {
    // files.hash stores the commit ID; files.id is the MinIO object key.
    const files = await pool.query(
      `SELECT version_file.id
       FROM modules m
       JOIN files current_file ON current_file.id = m.file_id
       JOIN files version_file ON version_file.filename = current_file.filename
       JOIN commits c ON c.id = version_file.hash
       WHERE m.name = $1 AND c.id = $2
       ORDER BY version_file.id
       LIMIT 1`,
      [name, commit],
    );

    if (files.rows.length === 0) {
      return res.status(404).json({ error: "Module file not found for this commit." });
    }

    const source = await minioClient.getObject("data", files.rows[0].id);
    source.on("error", (err) => {
      console.error("Error streaming module source:", err);
      if (res.headersSent) {
        res.destroy(err);
      } else {
        res.status(500).json({ error: "Failed to read module source." });
      }
    });
    res.type("text/plain");
    source.pipe(res);
  } catch (err) {
    console.error("Error loading module source:", err);
    if (err.code === "NoSuchKey" || err.code === "NotFound" || err.statusCode === 404) {
      return res.status(404).json({ error: "Module file not found in storage." });
    }
    res.status(500).json({ error: "Failed to load module source." });
  }
});

// 1. MODERNIZED GRAPH ENDPOINT
router.get("/graph", async (req, res) => {
  try {
    // Fetch all hardware AST modules with their rich version metadata
    const nodesResult = await pool.query(
      `SELECT m.id, m.name, m.hash, m.merkle_hash, m.last_touched_commit_hash, f.filename 
       FROM modules m
       JOIN files f ON m.file_id = f.id`,
    );

    // Join edges against the modules table to map UUIDs (from_id/to_id) back to string names
    const edgesResult = await pool.query(
      `SELECT e.id, m1.name AS source, m2.name AS target
       FROM edges e
       JOIN modules m1 ON e.from_id = m1.id
       JOIN modules m2 ON e.to_id = m2.id`,
    );

    // Format for D3.js, Cytoscape, or React Flow
    const nodes = nodesResult.rows.map((r) => ({
      id: r.name, // String ID used by visualization libraries for link resolution
      uuid: r.id,
      filename: r.filename,
      hash: r.hash,
      merkle_hash: r.merkle_hash,
      last_commit: r.last_touched_commit_hash,
    }));

    const links = edgesResult.rows.map((r) => ({
      source: r.source,
      target: r.target,
    }));

    res.json({ nodes, links });
  } catch (err) {
    console.error("Error fetching graph:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 2. MODERNIZED SEARCH ENDPOINT (Queries 'modules' table directly)
router.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length === 0) return res.json([]);

  const query = q.trim();

  try {
    const result = await pool.query(
      `SELECT name AS module,
         CASE WHEN LOWER(name) = LOWER($1) THEN 3
              WHEN name ILIKE $1 || '%' THEN 2
              ELSE 1 END AS rank
       FROM modules
       WHERE name ILIKE '%' || $1 || '%'
       ORDER BY rank DESC, name ASC
       LIMIT 20`,
      [query],
    );

    res.json(result.rows.map((r) => r.module));
  } catch (err) {
    console.error("Error during search:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 3. MODERNIZED USER MODULES ENDPOINT
router.get("/mymodules", async (req, res) => {
  const userUUID = req.uuid;
  try {
    // Keep modules listed after another user changes their latest version.
    const modules = await pool.query(
      `SELECT m.name
       FROM modules m
       WHERE EXISTS (
         SELECT 1 FROM commits c
         WHERE c.commit_by = $1
           AND (
             c.id = m.last_touched_commit_hash
             OR EXISTS (
               SELECT 1 FROM edit_actions a
               WHERE a.commit_id = c.id
                 AND (a.old_module = m.name OR a.new_module = m.name)
             )
           )
       )
       ORDER BY m.name`,
      [userUUID],
    );

    res.json(modules.rows.map((r) => r.name));
  } catch (err) {
    console.error("Error fetching user modules:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 1. Fetch chronological list of commits for the dropdown
router.get("/commits-list", async (req, res) => {
  try {
    const commits = await pool.query(
      `SELECT id, timestamp, commit_by 
       FROM commits 
       ORDER BY timestamp DESC`,
    );
    res.json(commits.rows);
  } catch (err) {
    console.error("Error fetching commits:", err);
    res.status(500).json({ error: "Failed to fetch commits list." });
  }
});

// 2. Fetch AST edit script actions for a specific commit
router.get("/commit-diff/:commit_id", async (req, res) => {
  const { commit_id } = req.params;

  try {
    // Grab all GumTree AST actions recorded for this commit
    const actions = await pool.query(
      `SELECT id, index_n, action, old_module, new_module, old_parent, new_parent 
       FROM edit_actions 
       WHERE commit_id = $1 
       ORDER BY index_n ASC`,
      [commit_id],
    );

    // Group affected modules by action type for easy frontend styling
    const diffSummary = {
      commit_id,
      add: new Set(),
      update: new Set(),
      move: new Set(),
      disconnect: new Set(),
      raw_actions: actions.rows,
    };

    for (const row of actions.rows) {
      const targetModule = row.new_module || row.old_module;
      if (!targetModule) continue;

      if (row.action === "add") diffSummary.add.add(targetModule);
      else if (row.action === "update") diffSummary.update.add(targetModule);
      else if (row.action === "move") diffSummary.move.add(targetModule);
      else if (row.action === "disconnect")
        diffSummary.disconnect.add(targetModule);
    }

    // Convert Sets to Arrays for JSON serialization
    res.json({
      commit_id,
      add: Array.from(diffSummary.add),
      update: Array.from(diffSummary.update),
      move: Array.from(diffSummary.move),
      disconnect: Array.from(diffSummary.disconnect),
      raw_actions: actions.rows,
    });
  } catch (err) {
    console.error("Error fetching commit diff:", err);
    res.status(500).json({ error: "Failed to fetch commit diff." });
  }
});

module.exports = router;
