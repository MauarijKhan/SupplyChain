# ⛓️ Supply Chain Management DApp
**Mauarij Khan (22l-6820)** | Blockchain Assignment | Polygon Mumbai Testnet

---

## Overview
A decentralised supply chain DApp built with **Solidity**, **Hardhat**, and **React**. Products are tracked on-chain from Manufacturer → Distributor → Retailer → Customer with full immutable audit trails.

---

## Project Structure
```
supplychain/
├── contracts/
│   └── student_supplychain.sol    # Main smart contract
├── scripts/
│   └── deploy.js                  # Hardhat deployment script
├── test/
│   └── student_supplychain.test.js
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Main React component
│   │   ├── App.css                # Styles
│   │   └── main.jsx               # Entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── hardhat.config.js
├── package.json
└── .env.example
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your PRIVATE_KEY and MUMBAI_RPC_URL
```

### 3. Compile
```bash
npx hardhat compile
```

### 4. Run tests
```bash
npx hardhat test
```

### 5. Deploy to Mumbai
```bash
npx hardhat run scripts/deploy.js --network mumbai
```

### 6. Run frontend
```bash
cd frontend
npm install
# Set VITE_CONTRACT_ADDRESS=<deployed_address> in frontend/.env
npm run dev
```

---

## Contract Address (Polygon Mumbai)
> Fill in after deployment: `0x___________________________`

## Transaction Hash
> Fill in after deployment: `0x___________________________`

---

## Roles
| Role | Capabilities |
|------|-------------|
| Manufacturer | Register products, ship to Distributor |
| Distributor | Receive, ship to Retailer |
| Retailer | Receive, sell to Customer |
| Customer | Confirm delivery |
