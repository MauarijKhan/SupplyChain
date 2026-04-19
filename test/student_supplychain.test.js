// test/student_supplychain.test.js
const { expect }        = require("chai");
const { ethers }        = require("hardhat");

const Role = { None: 0, Manufacturer: 1, Distributor: 2, Retailer: 3, Customer: 4 };
const Status = {
  Manufactured: 0,
  InTransit:    1,
  AtDistributor:2,
  InDelivery:   3,
  AtRetailer:   4,
  Sold:         5,
  Delivered:    6,
};

describe("student_supplychain", function () {
  let contract;
  let owner, distributor, retailer, customer, stranger;

  beforeEach(async () => {
    [owner, distributor, retailer, customer, stranger] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("student_supplychain");
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    // Register participants
    await contract.registerParticipant(distributor.address, Role.Distributor, "Dist Co");
    await contract.registerParticipant(retailer.address,    Role.Retailer,    "Retail Shop");
    await contract.registerParticipant(customer.address,    Role.Customer,    "John Doe");
  });

  // ── Participant registration ──────────────────────────────
  describe("Participant Registration", () => {
    it("deploys and registers deployer as Manufacturer", async () => {
      const p = await contract.participants(owner.address);
      expect(p.role).to.equal(Role.Manufacturer);
    });

    it("owner can register a Distributor", async () => {
      const p = await contract.participants(distributor.address);
      expect(p.role).to.equal(Role.Distributor);
      expect(p.name).to.equal("Dist Co");
    });

    it("reverts when non-owner tries to register", async () => {
      await expect(
        contract.connect(stranger).registerParticipant(stranger.address, Role.Customer, "X")
      ).to.be.revertedWith("SC: Not contract owner");
    });

    it("reverts on duplicate registration", async () => {
      await expect(
        contract.registerParticipant(distributor.address, Role.Distributor, "Dup")
      ).to.be.revertedWith("SC: Already registered");
    });
  });

  // ── Product creation ──────────────────────────────────────
  describe("Product Creation", () => {
    it("Manufacturer can create a product", async () => {
      await expect(contract.createProduct("Widget A", "A test widget"))
        .to.emit(contract, "ProductCreated")
        .withArgs(1, "Widget A", owner.address);

      const p = await contract.getProduct(1);
      expect(p.name).to.equal("Widget A");
      expect(p.status).to.equal(Status.Manufactured);
      expect(p.currentOwner).to.equal(owner.address);
    });

    it("Non-manufacturer cannot create a product", async () => {
      await expect(
        contract.connect(distributor).createProduct("Bad", "bad")
      ).to.be.revertedWith("SC: Incorrect role");
    });

    it("increments product counter", async () => {
      await contract.createProduct("P1", "d");
      await contract.createProduct("P2", "d");
      expect(await contract.getProductCount()).to.equal(2);
    });
  });

  // ── Full supply chain flow ────────────────────────────────
  describe("Full Supply Chain Flow", () => {
    beforeEach(async () => {
      await contract.createProduct("TrackMe", "Tracking product");
    });

    it("Manufacturer ships to Distributor", async () => {
      await expect(contract.shipToDistributor(1, distributor.address))
        .to.emit(contract, "OwnershipTransferred")
        .withArgs(1, owner.address, distributor.address, Status.InTransit);

      const p = await contract.getProduct(1);
      expect(p.currentOwner).to.equal(distributor.address);
      expect(p.status).to.equal(Status.InTransit);
    });

    it("Full chain: Mfr → Dist → Retailer → Customer", async () => {
      // Ship to distributor
      await contract.shipToDistributor(1, distributor.address);

      // Distributor receives
      await contract.connect(distributor).receiveAsDistributor(1);
      expect((await contract.getProduct(1)).status).to.equal(Status.AtDistributor);

      // Ship to retailer
      await contract.connect(distributor).shipToRetailer(1, retailer.address);
      expect((await contract.getProduct(1)).status).to.equal(Status.InDelivery);

      // Retailer receives
      await contract.connect(retailer).receiveAsRetailer(1);
      expect((await contract.getProduct(1)).status).to.equal(Status.AtRetailer);

      // Sell to customer
      await contract.connect(retailer).sellToCustomer(1, customer.address);
      expect((await contract.getProduct(1)).status).to.equal(Status.Sold);

      // Customer confirms
      await contract.connect(customer).confirmDelivery(1);
      const final = await contract.getProduct(1);
      expect(final.status).to.equal(Status.Delivered);
      expect(final.currentOwner).to.equal(customer.address);
    });

    it("Records complete audit trail", async () => {
      await contract.shipToDistributor(1, distributor.address);
      await contract.connect(distributor).receiveAsDistributor(1);

      const history = await contract.getProductHistory(1);
      expect(history.length).to.equal(3); // manufactured + inTransit + atDistributor
      expect(history[0].status).to.equal(Status.Manufactured);
      expect(history[1].status).to.equal(Status.InTransit);
      expect(history[2].status).to.equal(Status.AtDistributor);
    });
  });

  // ── Access control ────────────────────────────────────────
  describe("Access Control", () => {
    it("Distributor cannot ship to Retailer before receiving", async () => {
      await contract.createProduct("Ctrl", "ctrl");
      await contract.shipToDistributor(1, distributor.address);
      // Retailer tries to act – should fail (not owner)
      await expect(
        contract.connect(retailer).receiveAsRetailer(1)
      ).to.be.revertedWith("SC: Not product owner");
    });

    it("Cannot ship to wrong role", async () => {
      await contract.createProduct("Wrong", "wrong");
      await expect(
        contract.shipToDistributor(1, retailer.address) // retailer is not a distributor
      ).to.be.revertedWith("SC: Target is not a Distributor");
    });
  });
});
