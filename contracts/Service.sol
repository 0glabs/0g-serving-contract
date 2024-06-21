// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

struct Service {
    address provider;
    string name;
    uint inputPrice;
    uint outputPrice;
    string url;
    uint updatedAt;
}

library ServiceLibrary {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    error ServiceNotexist(address provider, string name);

    struct ServiceMap {
        EnumerableSet.Bytes32Set _keys;
        mapping(bytes32 => Service) _values;
    }

    function getService(
        ServiceMap storage map,
        address provider,
        string memory name
    ) internal view returns (uint, uint, string memory, uint) {
        Service storage value = _get(map, provider, name);
        return (value.inputPrice, value.outputPrice, value.url, value.updatedAt);
    }

    function getAllServices(
        ServiceMap storage map
    )
        internal
        view
        returns (
            address[] memory addresses,
            uint[] memory inputPrices,
            uint[] memory outputPrices,
            string[] memory urls,
            string[] memory names,
            uint[] memory updatedAts
        )
    {
        uint len = _length(map);
        addresses = new address[](len);
        inputPrices = new uint[](len);
        outputPrices = new uint[](len);
        urls = new string[](len);
        names = new string[](len);
        updatedAts = new uint[](len);
        for (uint i = 0; i < len; ++i) {
            Service storage value = _at(map, i);
            addresses[i] = value.provider;
            inputPrices[i] = value.inputPrice;
            outputPrices[i] = value.outputPrice;
            urls[i] = value.url;
            names[i] = value.name;
            updatedAts[i] = value.updatedAt;
        }
    }

    function addOrUpdateService(
        ServiceMap storage map,
        address provider,
        string memory name,
        uint inputPrice,
        uint outputPrice,
        string memory url
    ) internal {
        bytes32 key = _key(provider, name);
        if (!_contains(map, key)) {
            _set(map, key, Service(provider, name, inputPrice, outputPrice, url, block.timestamp));
            return;
        }
        Service storage value = _get(map, provider, name);
        value.name = name;
        value.inputPrice = inputPrice;
        value.outputPrice = outputPrice;
        value.url = url;
        value.updatedAt = block.timestamp;
    }

    function removeService(ServiceMap storage map, address provider, string memory name) internal {
        bytes32 key = _key(provider, name);
        if (!_contains(map, key)) {
            revert ServiceNotexist(provider, name);
        }
        _remove(map, key);
    }

    function _at(ServiceMap storage map, uint index) internal view returns (Service storage) {
        bytes32 key = map._keys.at(index);
        return map._values[key];
    }

    function _set(ServiceMap storage map, bytes32 key, Service memory value) internal returns (bool) {
        map._values[key] = value;
        return map._keys.add(key);
    }

    function _get(
        ServiceMap storage map,
        address provider,
        string memory name
    ) internal view returns (Service storage) {
        bytes32 key = _key(provider, name);
        Service storage value = map._values[key];
        if (!_contains(map, key)) {
            revert ServiceNotexist(provider, name);
        }
        return value;
    }

    function _remove(ServiceMap storage map, bytes32 key) internal returns (bool) {
        delete map._values[key];
        return map._keys.remove(key);
    }

    function _contains(ServiceMap storage map, bytes32 key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    function _length(ServiceMap storage map) internal view returns (uint) {
        return map._keys.length();
    }

    function _key(address provider, string memory name) internal pure returns (bytes32) {
        return keccak256(abi.encode(provider, name));
    }
}
