import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { claimRoutes } from "./routes/claim";
import { healthRoutes } from "./routes/health";
import { statusRoutes } from "./routes/status";
import { upiRoutes } from "./routes/upi";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/upi", upiRoutes);
app.use("/claim", claimRoutes);
app.use("/tx", statusRoutes);
app.use("/health", healthRoutes);

app.get("/", (req, res) => {
  res.json({ message: "UniPay Relayer Backend", version: "1.0.0" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
