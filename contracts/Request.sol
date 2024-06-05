// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

struct RequestTrace {
    Request[] requests;
}

struct Request {
    address userAddress;
    uint nonce;
    bytes32 serviceType;
    bytes signature;
    uint createdAt;
}

library RequestLibrary {
    function verify(Request memory request, address serviceProviderAddress) internal pure returns (bool) {
        bytes32 message = prefixed(
            keccak256(
                abi.encodePacked(
                    serviceProviderAddress,
                    request.userAddress,
                    request.serviceType,
                    request.nonce,
                    request.createdAt
                )
            )
        );

        return recoverSigner(message, request.signature) == request.userAddress;
    }

    function splitSignature(bytes memory sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65);

        assembly {
            // first 32 bytes, after the length prefix.
            r := mload(add(sig, 32))
            // second 32 bytes.
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes).
            v := byte(0, mload(add(sig, 96)))
        }

        return (v, r, s);
    }

    function recoverSigner(bytes32 message, bytes memory sig) internal pure returns (address) {
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(sig);
        return ecrecover(message, v, r, s);
    }

    function prefixed(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }
}
