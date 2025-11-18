import express from "express";
import bodyParser from "body-parser";
import { Client, resources } from "coinbase-commerce-node";
import dotenv from "dotenv";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

dotenv.config();

Client.init(process.env.COINBASE_API_KEY || "");
const { Charge } = resources;

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(process.cwd(), "frontend", "build")));

// Create a charge using Coinbase Commerce
app.post("/create-payment", async (req, res) => {
  try {
    const charge = await Charge.create({
      name: "E-commerce Order",
      description: "Crypto payment for digital product",
      pricing_type: "fixed_price",
      local_price: {
        amount: "10.00",
        currency: "USD"
      },
      metadata: {
        orderId: (Math.random() + 1).toString(36).substring(7)
      }
    });

    res.json({ url: charge.hosted_url, id: charge.id });
  } catch (err) {
    console.error("create-payment error:", err);
    res.status(500).json({ error: "Error creating payment" });
  }
});

// Webhook endpoint (demo: reacts to charge:confirmed)
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;
    // NOTE: In production validate signature using Coinbase webhook secret
    if (event && event.type === "charge:confirmed") {
      const paymentId = event.data && event.data.id ? event.data.id : "unknown";
      console.log("Payment confirmed:", paymentId);
      // Mint NFT (call smart contract) — here we attempt minting if env vars are present
      if (process.env.SEPOLIA_URL && process.env.PRIVATE_KEY && process.env.NFT_CONTRACT) {
        await mintNFT(paymentId);
      } else {
        console.log("Minting skipped: missing env vars (SEPOLIA_URL / PRIVATE_KEY / NFT_CONTRACT)");
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("webhook error:", err);
    res.sendStatus(500);
  }
});

async function mintNFT(paymentId) {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // load ABI (assumes you compiled and kept artifacts in ./artifacts)
  try {
    const jsonPath = "./artifacts/contracts/PaymentNFT.sol/PaymentNFT.json";
    const json = JSON.parse(fs.readFileSync(jsonPath));
    const abi = json.abi;
    const contractAddress = process.env.NFT_CONTRACT;
    const contract = new ethers.Contract(contractAddress, abi, wallet);
    const tx = await contract.mintNFT(wallet.address, `Payment ID: ${paymentId}`);
    console.log("Mint tx hash:", tx.hash);
    await tx.wait();
    console.log("NFT minted for payment", paymentId);
  } catch (err) {
    console.error("mintNFT error:", err);
  }
}

// Serve frontend (if built)
app.get("*", (req, res) => {
  const indexPath = path.join(process.cwd(), "frontend", "build", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ status: "server running" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
