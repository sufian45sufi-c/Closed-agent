const activeSandboxes = global.__fabionSandboxes || (global.__fabionSandboxes = new Map());

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId } = req.body;
  const existing = activeSandboxes.get(sessionId);

  if (existing) {
    await existing.sandbox.stop().catch(() => {});
    activeSandboxes.delete(sessionId);
  }

  res.status(200).json({ closed: true });
}
