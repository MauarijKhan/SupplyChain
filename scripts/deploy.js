// scripts/deploy.js
// Deploy student_supplychain to Polygon Mumbai / Amoy Testnet

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=".repeat(60));
  console.log("  Supply Chain DApp – Deployment Script");
  console.log("=".repeat(60));

  // ── Signers ────────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  console.log("\n📦 Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "MATIC");

  // ── Deploy ─────────────────────────────────────────────────
  console.log("\n⏳ Deploying student_supplychain...");
  const SupplyChain = await ethers.getContractFactory("student_supplychain");
  const contract    = await SupplyChain.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  console.log("\n✅ Contract deployed!");
  console.log("   Address     :", address);
  console.log("   Tx Hash     :", deployTx.hash);
  console.log("   Block Number:", deployTx.blockNumber ?? "pending");

  // ── Seed Demo Participants ─────────────────────────────────
  // (skip on live networks – just log instructions)
  const network = await ethers.provider.getNetwork();
  const isLocal = network.chainId === 31337n;

  if (isLocal) {
    const signers = await ethers.getSigners();
    console.log("\n🌱 Seeding demo participants on local network...");

    const roles = { Manufacturer: 1, Distributor: 2, Retailer: 3, Customer: 4 };

    await contract.registerParticipant(signers[1].address, roles.Distributor,  "Demo Distributor");
    await contract.registerParticipant(signers[2].address, roles.Retailer,     "Demo Retailer");
    await contract.registerParticipant(signers[3].address, roles.Customer,     "Demo Customer");
    console.log("   Distributor :", signers[1].address);
    console.log("   Retailer    :", signers[2].address);
    console.log("   Customer    :", signers[3].address);

    // Create a sample product
    const tx = await contract.createProduct("Test Widget", "A sample product for demonstration");
    const receipt = await tx.wait();
    console.log("\n📦 Sample product created (ID: 1)");
  }

  // ── Write deployment info ──────────────────────────────────
  const info = {
    network:         network.name,
    chainId:         network.chainId.toString(),
    contractAddress: address,
    deployerAddress: deployer.address,
    txHash:          deployTx.hash,
    deployedAt:      new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "../frontend/src/deploymentInfo.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(info, null, 2));
  console.log("\n📄 Deployment info written to frontend/src/deploymentInfo.json");

  // ── ABI copy ───────────────────────────────────────────────
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/student_supplychain.sol/student_supplychain.json"
  );
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath));
    const abiPath  = path.join(__dirname, "../frontend/src/abi.json");
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
    console.log("📋 ABI copied to frontend/src/abi.json");
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Deployment complete 🎉");
  if (!isLocal) {
    console.log(`\n  View on PolygonScan:`);
    console.log(`  https://mumbai.polygonscan.com/address/${address}`);
  }
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
