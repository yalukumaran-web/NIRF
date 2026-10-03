import express from "express";
import cors from "cors";
import path from "path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../.env") });

import authRoutes from "./routes/authRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import scoreRoutes from "./routes/scoreRoutes";
import predictRoutes from "./routes/predictRoutes";
import documentRoutes from "./routes/documentRoutes";
import calculationRoutes from "./routes/calculationRoutes";
import mlRoutes from "./routes/mlRoutes";
import absoluteRoutes from "./routes/absoluteRoutes";
import relativeRoutes from "./routes/relativeRoutes";
import publicRoutes from "./routes/publicRoutes";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api", publicRoutes);
// Public, stateless absolute scoring — must mount before routers that apply
// a blanket `router.use(requireAuth)` at their /api mount point.
app.use("/api/absolute", absoluteRoutes);
// Public, stateless relative-parameter prediction module — independent from
// the Absolute (FSR/GUE/PCS/FQE/WD/RD) pipeline. ADDITIVE only.
app.use("/api/relative", relativeRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api", scoreRoutes);
app.use("/api", predictRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api", calculationRoutes);
app.use("/api/ml", mlRoutes);

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`NIRF API listening on http://localhost:${port}`);
});
