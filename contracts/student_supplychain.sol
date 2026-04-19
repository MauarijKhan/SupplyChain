// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title student_supplychain
 * @author Mauarij Khan (22l-6820)
 * @notice Supply Chain Management DApp on Polygon Network
 * @dev Implements role-based product tracking from Manufacturer to Consumer
 */
contract student_supplychain {

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum Role { None, Manufacturer, Distributor, Retailer, Customer }

    enum ProductStatus {
        Manufactured,
        InTransit,
        AtDistributor,
        InDelivery,
        AtRetailer,
        Sold,
        Delivered
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Product {
        uint256 id;
        string  name;
        string  description;
        address currentOwner;
        ProductStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        bool    exists;
    }

    struct HistoryEntry {
        address  from;
        address  to;
        ProductStatus status;
        uint256  timestamp;
        string   note;
    }

    struct Participant {
        address addr;
        Role    role;
        string  name;
        bool    registered;
    }

    // ─── State Variables ──────────────────────────────────────────────────────

    address public owner;
    uint256 private productCounter;

    mapping(uint256 => Product)           public products;
    mapping(uint256 => HistoryEntry[])    private productHistory;
    mapping(address => Participant)       public participants;

    uint256[] private allProductIds;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ParticipantRegistered(address indexed addr, Role role, string name);
    event ProductCreated(uint256 indexed productId, string name, address indexed manufacturer);
    event OwnershipTransferred(
        uint256 indexed productId,
        address indexed from,
        address indexed to,
        ProductStatus newStatus
    );

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "SC: Not contract owner");
        _;
    }

    modifier onlyRole(Role _role) {
        require(participants[msg.sender].role == _role, "SC: Incorrect role");
        _;
    }

    modifier productExists(uint256 _id) {
        require(products[_id].exists, "SC: Product does not exist");
        _;
    }

    modifier onlyCurrentOwner(uint256 _id) {
        require(products[_id].currentOwner == msg.sender, "SC: Not product owner");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        // Register deployer as Manufacturer by default
        participants[msg.sender] = Participant({
            addr: msg.sender,
            role: Role.Manufacturer,
            name: "Contract Deployer",
            registered: true
        });
        emit ParticipantRegistered(msg.sender, Role.Manufacturer, "Contract Deployer");
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    /**
     * @notice Register a participant with a specific role
     * @param _addr    Wallet address of the participant
     * @param _role    Role enum value (1=Manufacturer, 2=Distributor, 3=Retailer, 4=Customer)
     * @param _name    Human-readable name
     */
    function registerParticipant(
        address _addr,
        Role    _role,
        string  calldata _name
    ) external onlyOwner {
        require(_addr != address(0),             "SC: Zero address");
        require(_role != Role.None,              "SC: Invalid role");
        require(!participants[_addr].registered, "SC: Already registered");

        participants[_addr] = Participant({
            addr: _addr,
            role: _role,
            name: _name,
            registered: true
        });

        emit ParticipantRegistered(_addr, _role, _name);
    }

    // ─── Manufacturer Functions ───────────────────────────────────────────────

    /**
     * @notice Create / register a new product (Manufacturer only)
     * @param _name        Product name
     * @param _description Product description
     * @return productId   The newly assigned product ID
     */
    function createProduct(
        string calldata _name,
        string calldata _description
    ) external onlyRole(Role.Manufacturer) returns (uint256 productId) {
        productCounter++;
        productId = productCounter;

        products[productId] = Product({
            id:           productId,
            name:         _name,
            description:  _description,
            currentOwner: msg.sender,
            status:       ProductStatus.Manufactured,
            createdAt:    block.timestamp,
            updatedAt:    block.timestamp,
            exists:       true
        });

        allProductIds.push(productId);

        productHistory[productId].push(HistoryEntry({
            from:      address(0),
            to:        msg.sender,
            status:    ProductStatus.Manufactured,
            timestamp: block.timestamp,
            note:      "Product manufactured and registered"
        }));

        emit ProductCreated(productId, _name, msg.sender);
    }

    // ─── Transfer Functions ───────────────────────────────────────────────────

    /**
     * @notice Transfer product from Manufacturer → Distributor
     */
    function shipToDistributor(
        uint256 _productId,
        address _distributor
    )
        external
        productExists(_productId)
        onlyRole(Role.Manufacturer)
        onlyCurrentOwner(_productId)
    {
        require(
            participants[_distributor].role == Role.Distributor,
            "SC: Target is not a Distributor"
        );
        _transfer(_productId, _distributor, ProductStatus.InTransit, "Shipped to distributor");
    }

    /**
     * @notice Distributor receives the product
     */
    function receiveAsDistributor(uint256 _productId)
        external
        productExists(_productId)
        onlyRole(Role.Distributor)
        onlyCurrentOwner(_productId)
    {
        _updateStatus(_productId, ProductStatus.AtDistributor, "Received by distributor");
    }

    /**
     * @notice Transfer product from Distributor → Retailer
     */
    function shipToRetailer(
        uint256 _productId,
        address _retailer
    )
        external
        productExists(_productId)
        onlyRole(Role.Distributor)
        onlyCurrentOwner(_productId)
    {
        require(
            participants[_retailer].role == Role.Retailer,
            "SC: Target is not a Retailer"
        );
        _transfer(_productId, _retailer, ProductStatus.InDelivery, "Shipped to retailer");
    }

    /**
     * @notice Retailer receives the product
     */
    function receiveAsRetailer(uint256 _productId)
        external
        productExists(_productId)
        onlyRole(Role.Retailer)
        onlyCurrentOwner(_productId)
    {
        _updateStatus(_productId, ProductStatus.AtRetailer, "Received by retailer");
    }

    /**
     * @notice Retailer sells product to a Customer
     */
    function sellToCustomer(
        uint256 _productId,
        address _customer
    )
        external
        productExists(_productId)
        onlyRole(Role.Retailer)
        onlyCurrentOwner(_productId)
    {
        require(
            participants[_customer].role == Role.Customer,
            "SC: Target is not a Customer"
        );
        _transfer(_productId, _customer, ProductStatus.Sold, "Sold to customer");
    }

    /**
     * @notice Customer confirms delivery
     */
    function confirmDelivery(uint256 _productId)
        external
        productExists(_productId)
        onlyRole(Role.Customer)
        onlyCurrentOwner(_productId)
    {
        _updateStatus(_productId, ProductStatus.Delivered, "Delivery confirmed by customer");
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Get full product details
     */
    function getProduct(uint256 _productId)
        external
        view
        productExists(_productId)
        returns (Product memory)
    {
        return products[_productId];
    }

    /**
     * @notice Get the complete audit trail for a product
     */
    function getProductHistory(uint256 _productId)
        external
        view
        productExists(_productId)
        returns (HistoryEntry[] memory)
    {
        return productHistory[_productId];
    }

    /**
     * @notice Get all registered product IDs
     */
    function getAllProductIds() external view returns (uint256[] memory) {
        return allProductIds;
    }

    /**
     * @notice Get total number of products
     */
    function getProductCount() external view returns (uint256) {
        return productCounter;
    }

    /**
     * @notice Get role of a participant
     */
    function getParticipantRole(address _addr) external view returns (Role) {
        return participants[_addr].role;
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    function _transfer(
        uint256       _productId,
        address       _to,
        ProductStatus _status,
        string memory _note
    ) internal {
        address from = products[_productId].currentOwner;

        products[_productId].currentOwner = _to;
        products[_productId].status       = _status;
        products[_productId].updatedAt    = block.timestamp;

        productHistory[_productId].push(HistoryEntry({
            from:      from,
            to:        _to,
            status:    _status,
            timestamp: block.timestamp,
            note:      _note
        }));

        emit OwnershipTransferred(_productId, from, _to, _status);
    }

    function _updateStatus(
        uint256       _productId,
        ProductStatus _status,
        string memory _note
    ) internal {
        address addr = products[_productId].currentOwner;

        products[_productId].status    = _status;
        products[_productId].updatedAt = block.timestamp;

        productHistory[_productId].push(HistoryEntry({
            from:      addr,
            to:        addr,
            status:    _status,
            timestamp: block.timestamp,
            note:      _note
        }));

        emit OwnershipTransferred(_productId, addr, addr, _status);
    }
}
