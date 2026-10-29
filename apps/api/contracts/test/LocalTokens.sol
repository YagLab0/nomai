// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// Test-only tokens for `scripts/smoke-escrow.ts` (the in-process ganache
/// verification of the Escrow vault — issue #57). Never deployed to a real
/// network: the whole supply is minted to the deployer in the constructor.
///
/// Constructors take no args on purpose — the same reason EscrowVault's does:
/// the ops scripts append the ERC-8021 attribution tag to the transaction
/// input, and Solidity decodes constructor args from the tail of the
/// initcode. No args, nothing to corrupt.
///
/// `SmokeARS` mimics the USDT-family quirk the vault's safe-transfer path
/// exists for: `transfer` succeeds but returns no bool.

contract LocalToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 supply_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        balanceOf[msg.sender] = supply_;
        emit Transfer(address(0), msg.sender, supply_);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external virtual returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) internal {
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}

/// Bool-returning ERC-20, 6 decimals — the USDC shape.
contract SmokeUSD is LocalToken {
    constructor() LocalToken("Smoke USD", "sUSD", 6, 1_000_000_000_000) {}
}

/// `transfer` returns nothing, like USDT — 18 decimals, the wFIAT shape.
contract SmokeARS is LocalToken {
    constructor() LocalToken("Smoke ARS", "sARS", 18, 1_000_000 ether) {}

    function transfer(address to, uint256 value) external override returns (bool) {
        _move(msg.sender, to, value);
        assembly {
            return(0, 0)
        }
    }
}
