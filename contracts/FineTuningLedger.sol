// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./BaseLedger.sol";

struct Deliverable {
    bytes16 id;
    bytes rootHash;
}

struct FineTuningLedgerExtra {
    string providerSigner;
    Deliverable[] deliverables;
}

struct FineTuningLedger {
    BaseLedger base;
    FineTuningLedgerExtra extra;
}

struct FineTuningLedgerExtraMap {
    EnumerableSet.Bytes32Set _keys;
    mapping(bytes32 => FineTuningLedgerExtra) _values;
}

struct FineTuningLedgerMap {
    BaseLedgerMap baseMap;
    FineTuningLedgerExtraMap extraMap;
}

library FineTuningLedgerLibrary {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using BaseLedgerLibrary for BaseLedgerMap;

    error LedgerNotExists(address customer, address provider);
    error LedgerExists(address customer, address provider);

    function getLedger(
        FineTuningLedgerMap storage map,
        address customer,
        address provider,
        string memory serviceType
    ) internal view returns (FineTuningLedger memory) {
        BaseLedger storage base = map.baseMap.getLedger(customer, provider, serviceType);
        FineTuningLedgerExtra storage extra = _get(map.extraMap, customer, provider);
        return FineTuningLedger(base, extra);
    }

    function getAllLedgers(FineTuningLedgerMap storage map) internal view returns (FineTuningLedger[] memory ledgers) {
        uint len = _length(map.extraMap);
        ledgers = new FineTuningLedger[](len);

        for (uint i = 0; i < len; i++) {
            BaseLedger storage base = map.baseMap.at(i);
            FineTuningLedgerExtra storage extra = _at(map.extraMap, i);
            ledgers[i] = FineTuningLedger(base, extra);
        }
    }

    function addLedger(
        FineTuningLedgerMap storage map,
        address customer,
        address provider,
        uint amount
    ) internal returns (uint, uint) {
        return map.baseMap.addBaseLedger(customer, provider, amount);
    }

    function deleteLedger(
        FineTuningLedgerMap storage map,
        address customer,
        address provider,
        string serviceType
    ) internal {
        map.baseMap.deleteBaseLedger(customer, provider, serviceType);
        bytes32 key = _key(customer, provider);
        if (!_contains(map.extraMap, key)) {
            revert LedgerNotExists(customer, provider);
        }
        map.extraMap._keys.remove(key);
        delete map.extraMap._values[key];
    }

    function updateProviderSigner(
        FineTuningLedgerMap storage map,
        address customer,
        address provider,
        string memory providerSigner
    ) internal {
        if (!_contains(map.extraMap, _key(customer, provider))) {
            revert LedgerNotExists(customer, provider);
        }
        FineTuningLedgerExtra storage extra = _get(map.extraMap, customer, provider);
        extra.providerSigner = providerSigner;
    }

    function updateDeliverables(
        FineTuningLedgerMap storage map,
        address customer,
        address provider,
        Deliverable memory deliverable
    ) internal {
        if (!_contains(map.extraMap, _key(customer, provider))) {
            revert LedgerNotExists(customer, provider);
        }
        FineTuningLedgerExtra storage extra = _get(map.extraMap, customer, provider);
        for (uint i = 0; i < extra.deliverables.length; i++) {
            if (extra.deliverables[i].id == deliverable.id) {
                revert("deliverable already exists.");
            }
        }
        extra.deliverables.push(deliverable);
    }

    function _at(
        FineTuningLedgerExtraMap storage map,
        uint index
    ) internal view returns (FineTuningLedgerExtra storage) {
        bytes32 key = map._keys.at(index);
        return map._values[key];
    }

    function _contains(FineTuningLedgerExtraMap storage map, bytes32 key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    function _length(FineTuningLedgerExtraMap storage map) internal view returns (uint) {
        return map._keys.length();
    }

    function _get(
        FineTuningLedgerExtraMap storage map,
        address customer,
        address provider
    ) internal view returns (FineTuningLedgerExtra storage) {
        bytes32 key = _key(customer, provider);
        FineTuningLedgerExtra storage value = map._values[key];
        if (!_contains(map, key)) {
            revert LedgerNotExists(customer, provider);
        }
        return value;
    }

    function _key(address customer, address provider) internal pure returns (bytes32) {
        return keccak256(abi.encode(customer, provider));
    }
}
