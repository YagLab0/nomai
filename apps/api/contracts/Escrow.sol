// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title EscrowVault — the shared nomai Escrow (ADR-0006, minimal reading).
/// @notice Receives every Booking payment as the x402 `payTo`. The `exact`
/// scheme settles with a plain ERC-20 transfer (EIP-3009 for the USDC family,
/// Permit2 `permitTransferFrom` for the Ripio wFIAT tokens), so funds arrive
/// with no function call — deposits need no hook. The admin routes funds back
/// out: releases to the Owner, refunds to the Traveler on a Cancellation or a
/// resolved Claim, and the Service-fee withdrawal. Booking↔funds attribution
/// stays in the database (`payments.payer` / `payments.tx_hash`); the vault
/// deliberately keeps no per-Booking accounting on-chain.
contract EscrowVault {
    address public admin;
    /// Two-step handover candidate (see `nominateAdmin`/`acceptAdmin`).
    address public pendingAdmin;

    /// One event per release, refund or Service-fee withdrawal — the whole
    /// on-chain audit trail of money leaving the Escrow.
    event Transferred(address indexed token, address indexed to, uint256 amount);
    event AdminNominated(address indexed candidate);
    event AdminChanged(address indexed previous, address indexed current);

    error NotAdmin();
    error NotPendingAdmin();
    error TokenTransferFailed();

    /// The deployer becomes admin. No constructor argument on purpose: the ops
    /// scripts send the deployment with an ERC-8021 attribution tag appended to
    /// the transaction input, and Solidity decodes constructor args from the
    /// END of the initcode — a declared arg would be corrupted by the suffix.
    /// The deploy script derives the deployer from the admin key and asserts it
    /// is the project wallet before sending, which is the real check.
    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /// @notice Route `amount` of `token` out of the vault — a release to the
    /// Owner, a refund to the Traveler, or the Service-fee withdrawal.
    /// @dev Low-level call so ERC-20s that return no bool (the USDT family)
    /// still work: empty returndata on a successful call counts as success.
    /// A call to an address with no code also "succeeds" with empty
    /// returndata, so a mistyped token would emit a release that moved
    /// nothing — rejected up front.
    function transfer(address token, address to, uint256 amount) external onlyAdmin {
        if (token.code.length == 0) revert TokenTransferFailed();
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
        emit Transferred(token, to, amount);
    }

    /// @notice Nominate a new admin; the candidate must call `acceptAdmin`.
    /// Two steps so a typo in `candidate` cannot lock the vault.
    function nominateAdmin(address candidate) external onlyAdmin {
        pendingAdmin = candidate;
        emit AdminNominated(candidate);
    }

    /// @notice Complete the handover initiated by `nominateAdmin`.
    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        emit AdminChanged(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }
}
