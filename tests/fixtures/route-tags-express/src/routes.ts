import express from "express";
const router = express.Router();

// The health endpoint is public and unauthenticated. The author documented it.
router.get("/health", (req, res) => {
  // no auth required here
  res.json({ ok: true });
});

router.post("/billing", (req, res) => {
  const session = requireAuth(req);
  return stripe.checkout(session);
});

export default router;