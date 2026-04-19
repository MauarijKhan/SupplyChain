import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import "./App.css";

// ── ABI (embedded for portability) ──────────────────────────────────────────
const ABI = [
  "function owner() view returns (address)",
  "function registerParticipant(address _addr, uint8 _role, string _name) external",
  "function createProduct(string _name, string _description) external returns (uint256)",
  "function shipToDistributor(uint256 _productId, address _distributor) external",
  "function receiveAsDistributor(uint256 _productId) external",
  "function shipToRetailer(uint256 _productId, address _retailer) external",
  "function receiveAsRetailer(uint256 _productId) external",
  "function sellToCustomer(uint256 _productId, address _customer) external",
  "function confirmDelivery(uint256 _productId) external",
  "function getProduct(uint256 _productId) view returns (tuple(uint256 id, string name, string description, address currentOwner, uint8 status, uint256 createdAt, uint256 updatedAt, bool exists))",
  "function getProductHistory(uint256 _productId) view returns (tuple(address from, address to, uint8 status, uint256 timestamp, string note)[])",
  "function getAllProductIds() view returns (uint256[])",
  "function getProductCount() view returns (uint256)",
  "function getParticipantRole(address _addr) view returns (uint8)",
  "function participants(address) view returns (address addr, uint8 role, string name, bool registered)",
  "event ProductCreated(uint256 indexed productId, string name, address indexed manufacturer)",
  "event OwnershipTransferred(uint256 indexed productId, address indexed from, address indexed to, uint8 newStatus)",
  "event ParticipantRegistered(address indexed addr, uint8 role, string name)",
];

// ── Constants ────────────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

const ROLE_NAMES   = ["None", "Manufacturer", "Distributor", "Retailer", "Customer"];
const ROLE_COLORS  = ["#666", "#6C63FF", "#00C9A7", "#FF6B6B", "#FFD166"];
const ROLE_ICONS   = ["⚪", "🏭", "🚚", "🏪", "👤"];

const STATUS_NAMES  = ["Manufactured", "In Transit", "At Distributor", "In Delivery", "At Retailer", "Sold", "Delivered"];
const STATUS_COLORS = ["#6C63FF", "#FF9800", "#00BCD4", "#FF5722", "#4CAF50", "#9C27B0", "#4CAF50"];
const STATUS_ICONS  = ["🏭", "🚛", "📦", "🚚", "🏪", "💳", "✅"];

// ── Helpers ──────────────────────────────────────────────────────────────────
const shortAddr = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
const formatDate = (ts) => new Date(Number(ts) * 1000).toLocaleString();

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [provider,    setProvider]    = useState(null);
  const [signer,      setSigner]      = useState(null);
  const [contract,    setContract]    = useState(null);
  const [account,     setAccount]     = useState("");
  const [myRole,      setMyRole]      = useState(0);
  const [myName,      setMyName]      = useState("");
  const [products,    setProducts]    = useState([]);
  const [selectedProd,setSelectedProd]= useState(null);
  const [history,     setHistory]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [txStatus,    setTxStatus]    = useState("");
  const [activeTab,   setActiveTab]   = useState("dashboard");
  const [error,       setError]       = useState("");

  // Forms
  const [regAddr,  setRegAddr]  = useState("");
  const [regRole,  setRegRole]  = useState(1);
  const [regName,  setRegName]  = useState("");
  const [prodName, setProdName] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [transferTarget, setTransferTarget] = useState("");
  const [searchId, setSearchId] = useState("");

  // ── Connect wallet ──────────────────────────────────────────────────────
  const connect = async () => {
    if (!window.ethereum) { setError("MetaMask not found. Please install it."); return; }
    try {
      setLoading(true);
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const prov = new ethers.BrowserProvider(window.ethereum);
      const sign = await prov.getSigner();
      const addr = await sign.getAddress();
      const ct   = new ethers.Contract(CONTRACT_ADDRESS, ABI, sign);

      setProvider(prov);
      setSigner(sign);
      setAccount(addr);
      setContract(ct);

      const roleNum  = await ct.getParticipantRole(addr);
      const partInfo = await ct.participants(addr);
      setMyRole(Number(roleNum));
      setMyName(partInfo.name || "");

      await loadProducts(ct);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Load products ────────────────────────────────────────────────────────
  const loadProducts = useCallback(async (ct) => {
    try {
      const ids  = await ct.getAllProductIds();
      const list = await Promise.all(ids.map(id => ct.getProduct(id)));
      setProducts(list.map(p => ({
        id:           Number(p.id),
        name:         p.name,
        description:  p.description,
        currentOwner: p.currentOwner,
        status:       Number(p.status),
        createdAt:    Number(p.createdAt),
        updatedAt:    Number(p.updatedAt),
      })));
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ── Load product history ─────────────────────────────────────────────────
  const loadHistory = async (id) => {
    if (!contract) return;
    try {
      const h = await contract.getProductHistory(id);
      setHistory(h.map(e => ({
        from:      e.from,
        to:        e.to,
        status:    Number(e.status),
        timestamp: Number(e.timestamp),
        note:      e.note,
      })));
    } catch (e) {
      setError(e.message);
    }
  };

  const selectProduct = async (p) => {
    setSelectedProd(p);
    setActiveTab("detail");
    await loadHistory(p.id);
  };

  // ── Transactions ─────────────────────────────────────────────────────────
  const tx = async (fn, successMsg) => {
    try {
      setLoading(true);
      setError("");
      setTxStatus("⏳ Sending transaction…");
      const t = await fn();
      setTxStatus("⏳ Waiting for confirmation…");
      await t.wait();
      setTxStatus(`✅ ${successMsg}`);
      await loadProducts(contract);
      setTimeout(() => setTxStatus(""), 4000);
    } catch (e) {
      setError(e.reason || e.message);
      setTxStatus("");
    } finally {
      setLoading(false);
    }
  };

  const registerParticipant = () =>
    tx(() => contract.registerParticipant(regAddr, regRole, regName), "Participant registered!");

  const createProduct = () =>
    tx(() => contract.createProduct(prodName, prodDesc), "Product created!");

  const doTransfer = (action) => {
    const actions = {
      shipDist:    () => contract.shipToDistributor(selectedProd.id, transferTarget),
      recvDist:    () => contract.receiveAsDistributor(selectedProd.id),
      shipRetail:  () => contract.shipToRetailer(selectedProd.id, transferTarget),
      recvRetail:  () => contract.receiveAsRetailer(selectedProd.id),
      sellCust:    () => contract.sellToCustomer(selectedProd.id, transferTarget),
      confirmDel:  () => contract.confirmDelivery(selectedProd.id),
    };
    tx(actions[action], "Transaction successful!");
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const StatusBadge = ({ status }) => (
    <span className="status-badge" style={{ background: STATUS_COLORS[status] + "22", color: STATUS_COLORS[status], border: `1px solid ${STATUS_COLORS[status]}55` }}>
      {STATUS_ICONS[status]} {STATUS_NAMES[status]}
    </span>
  );

  const RoleBadge = ({ role }) => (
    <span className="role-badge" style={{ background: ROLE_COLORS[role] + "22", color: ROLE_COLORS[role] }}>
      {ROLE_ICONS[role]} {ROLE_NAMES[role]}
    </span>
  );

  // ── Tab: Dashboard ────────────────────────────────────────────────────────
  const DashboardTab = () => (
    <div className="tab-content">
      <div className="stats-row">
        {[
          { label: "Total Products",      val: products.length,                                  icon: "📦" },
          { label: "Delivered",           val: products.filter(p => p.status === 6).length,      icon: "✅" },
          { label: "In Transit",          val: products.filter(p => [1,3].includes(p.status)).length, icon: "🚛" },
          { label: "Your Role",           val: ROLE_NAMES[myRole],                               icon: ROLE_ICONS[myRole] },
        ].map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-val">{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="section-header">
        <h2>All Products</h2>
        <button className="btn-ghost" onClick={() => loadProducts(contract)}>↻ Refresh</button>
      </div>

      {products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <p>No products registered yet.</p>
          {myRole === 1 && <button className="btn-primary" onClick={() => setActiveTab("create")}>Register First Product</button>}
        </div>
      ) : (
        <div className="product-grid">
          {products.map(p => (
            <div className="product-card" key={p.id} onClick={() => selectProduct(p)}>
              <div className="product-id">#{p.id}</div>
              <div className="product-name">{p.name}</div>
              <div className="product-desc">{p.description}</div>
              <div className="product-footer">
                <StatusBadge status={p.status} />
                <span className="product-owner">{shortAddr(p.currentOwner)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Tab: Product Detail ───────────────────────────────────────────────────
  const DetailTab = () => {
    if (!selectedProd) return <div className="empty-state">Select a product from the dashboard.</div>;
    const isOwner = selectedProd.currentOwner.toLowerCase() === account.toLowerCase();
    const s = selectedProd.status;

    return (
      <div className="tab-content">
        <button className="btn-ghost back-btn" onClick={() => setActiveTab("dashboard")}>← Back</button>

        <div className="detail-header">
          <div>
            <div className="detail-id">Product #{selectedProd.id}</div>
            <h2 className="detail-name">{selectedProd.name}</h2>
            <p className="detail-desc">{selectedProd.description}</p>
          </div>
          <StatusBadge status={s} />
        </div>

        <div className="detail-meta">
          <div><span>Owner</span><code>{selectedProd.currentOwner}</code></div>
          <div><span>Created</span><span>{formatDate(selectedProd.createdAt)}</span></div>
          <div><span>Updated</span><span>{formatDate(selectedProd.updatedAt)}</span></div>
        </div>

        {/* Action panel */}
        {isOwner && (
          <div className="action-panel">
            <h3>Actions</h3>
            {myRole === 1 && s === 0 && (
              <div className="action-row">
                <input placeholder="Distributor address" value={transferTarget} onChange={e => setTransferTarget(e.target.value)} />
                <button className="btn-primary" onClick={() => doTransfer("shipDist")}>Ship to Distributor</button>
              </div>
            )}
            {myRole === 2 && s === 1 && (
              <button className="btn-primary" onClick={() => doTransfer("recvDist")}>Confirm Receipt (Distributor)</button>
            )}
            {myRole === 2 && s === 2 && (
              <div className="action-row">
                <input placeholder="Retailer address" value={transferTarget} onChange={e => setTransferTarget(e.target.value)} />
                <button className="btn-primary" onClick={() => doTransfer("shipRetail")}>Ship to Retailer</button>
              </div>
            )}
            {myRole === 3 && s === 3 && (
              <button className="btn-primary" onClick={() => doTransfer("recvRetail")}>Confirm Receipt (Retailer)</button>
            )}
            {myRole === 3 && s === 4 && (
              <div className="action-row">
                <input placeholder="Customer address" value={transferTarget} onChange={e => setTransferTarget(e.target.value)} />
                <button className="btn-primary" onClick={() => doTransfer("sellCust")}>Sell to Customer</button>
              </div>
            )}
            {myRole === 4 && s === 5 && (
              <button className="btn-success" onClick={() => doTransfer("confirmDel")}>✅ Confirm Delivery</button>
            )}
            {s === 6 && <p className="delivered-msg">🎉 This product has been delivered.</p>}
          </div>
        )}

        {/* Audit trail */}
        <div className="history-section">
          <h3>Audit Trail</h3>
          <div className="timeline">
            {history.map((h, i) => (
              <div className="timeline-item" key={i}>
                <div className="timeline-dot" style={{ background: STATUS_COLORS[h.status] }} />
                <div className="timeline-content">
                  <div className="timeline-status">
                    {STATUS_ICONS[h.status]} <strong>{STATUS_NAMES[h.status]}</strong>
                  </div>
                  <div className="timeline-note">{h.note}</div>
                  <div className="timeline-meta">
                    {h.from !== "0x0000000000000000000000000000000000000000" &&
                      <span>From: {shortAddr(h.from)}</span>}
                    <span>To: {shortAddr(h.to)}</span>
                    <span>{formatDate(h.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Tab: Create Product ───────────────────────────────────────────────────
  const CreateTab = () => (
    <div className="tab-content form-tab">
      <h2>Register New Product</h2>
      <p className="form-subtitle">As Manufacturer, create a new product on the blockchain.</p>
      <div className="form-card">
        <label>Product Name</label>
        <input placeholder="e.g. iPhone 16 Pro" value={prodName} onChange={e => setProdName(e.target.value)} />
        <label>Description</label>
        <textarea placeholder="Describe the product…" value={prodDesc} onChange={e => setProdDesc(e.target.value)} rows={3} />
        <button className="btn-primary btn-full" onClick={createProduct} disabled={loading || !prodName}>
          {loading ? "Processing…" : "Register Product on Blockchain"}
        </button>
      </div>
    </div>
  );

  // ── Tab: Register Participant ─────────────────────────────────────────────
  const RegisterTab = () => (
    <div className="tab-content form-tab">
      <h2>Register Participant</h2>
      <p className="form-subtitle">Assign a role to a wallet address (Contract Owner only).</p>
      <div className="form-card">
        <label>Wallet Address</label>
        <input placeholder="0x…" value={regAddr} onChange={e => setRegAddr(e.target.value)} />
        <label>Role</label>
        <select value={regRole} onChange={e => setRegRole(Number(e.target.value))}>
          <option value={1}>🏭 Manufacturer</option>
          <option value={2}>🚚 Distributor</option>
          <option value={3}>🏪 Retailer</option>
          <option value={4}>👤 Customer</option>
        </select>
        <label>Name</label>
        <input placeholder="Participant name" value={regName} onChange={e => setRegName(e.target.value)} />
        <button className="btn-primary btn-full" onClick={registerParticipant} disabled={loading || !regAddr || !regName}>
          {loading ? "Processing…" : "Register on Blockchain"}
        </button>
      </div>
    </div>
  );

  // ── Tab: Track by ID ──────────────────────────────────────────────────────
  const TrackTab = () => (
    <div className="tab-content form-tab">
      <h2>Track Product</h2>
      <p className="form-subtitle">Enter a product ID to view its details and history.</p>
      <div className="form-card">
        <label>Product ID</label>
        <div className="search-row">
          <input type="number" placeholder="e.g. 1" value={searchId} onChange={e => setSearchId(e.target.value)} />
          <button className="btn-primary" onClick={async () => {
            const p = products.find(x => x.id === Number(searchId));
            if (p) selectProduct(p);
            else setError("Product not found");
          }}>Track</button>
        </div>
      </div>

      <div className="product-grid" style={{ marginTop: "2rem" }}>
        {products.map(p => (
          <div className="product-card mini" key={p.id} onClick={() => selectProduct(p)}>
            <div className="product-id">#{p.id}</div>
            <div className="product-name">{p.name}</div>
            <StatusBadge status={p.status} />
          </div>
        ))}
      </div>
    </div>
  );

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!account) return (
    <div className="app">
      <Header account={account} myRole={myRole} myName={myName} />
      <div className="connect-screen">
        <div className="connect-card">
          <div className="connect-icon">⛓️</div>
          <h2>Supply Chain DApp</h2>
          <p>Connect your MetaMask wallet to interact with the smart contract deployed on Polygon Mumbai Testnet.</p>
          <button className="btn-primary btn-lg" onClick={connect} disabled={loading}>
            {loading ? "Connecting…" : "Connect MetaMask"}
          </button>
          {error && <div className="error-msg">{error}</div>}
          <div className="contract-info">
            <span>Contract:</span>
            <code>{shortAddr(CONTRACT_ADDRESS)}</code>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app">
      <Header account={account} myRole={myRole} myName={myName} />

      {txStatus && <div className="tx-toast">{txStatus}</div>}
      {error    && <div className="error-toast" onClick={() => setError("")}>{error} ✕</div>}

      <div className="app-layout">
        <nav className="sidebar">
          {[
            { id: "dashboard", icon: "📊", label: "Dashboard" },
            { id: "track",     icon: "🔍", label: "Track Product" },
            ...(myRole === 1 ? [{ id: "create",    icon: "➕",  label: "Create Product" }] : []),
            ...(myRole === 0 ? [{ id: "register",  icon: "👥",  label: "Register" }] : []),
            { id: "register",  icon: "👥", label: "Register Role" },
            { id: "detail",    icon: "📋", label: "Product Detail" },
          ].filter((v, i, a) => a.findIndex(x => x.id === v.id) === i).map(tab => (
            <button key={tab.id} className={`nav-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <main className="main-content">
          {activeTab === "dashboard" && <DashboardTab />}
          {activeTab === "detail"    && <DetailTab />}
          {activeTab === "create"    && <CreateTab />}
          {activeTab === "register"  && <RegisterTab />}
          {activeTab === "track"     && <TrackTab />}
        </main>
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header({ account, myRole, myName }) {
  const ROLE_COLORS = ["#666", "#6C63FF", "#00C9A7", "#FF6B6B", "#FFD166"];
  const ROLE_NAMES  = ["None", "Manufacturer", "Distributor", "Retailer", "Customer"];
  const ROLE_ICONS  = ["⚪", "🏭", "🚚", "🏪", "👤"];

  return (
    <header className="app-header">
      <div className="header-brand">
        <span className="brand-icon">⛓️</span>
        <div>
          <div className="brand-name">ChainTrack</div>
          <div className="brand-sub">Supply Chain DApp · Polygon Network</div>
        </div>
      </div>
      <div className="header-center">
        <span className="student-name">Mauarij Khan</span>
        <span className="student-subtitle">22l-6820 · Blockchain Assignment · Supply Chain Management</span>
      </div>
      {account && (
        <div className="header-account">
          <div className="account-role" style={{ color: ROLE_COLORS[myRole] }}>
            {ROLE_ICONS[myRole]} {myName || ROLE_NAMES[myRole]}
          </div>
          <div className="account-addr">{account.slice(0, 6)}…{account.slice(-4)}</div>
        </div>
      )}
    </header>
  );
}
