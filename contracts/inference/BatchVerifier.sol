pragma solidity >=0.7.0 <0.9.0;

library BatchVerifier {
    function GroupOrder() public pure returns (uint256) {
        return
            21888242871839275222246405745257275088548364400416034343698204186575808495617;
    }

    function NegateY(uint256 Y) internal pure returns (uint256) {
        uint256 q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
        return q - (Y % q);
    }

    function accumulate(
        uint256[] memory in_proof,
        uint256[] memory proof_inputs, // public inputs, length is num_inputs * num_proofs
        uint256 num_proofs
    )
        internal
        view
        returns (
            uint256[] memory proofsAandC,
            uint256[] memory inputAccumulators
        )
    {
        uint256 q = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        uint256 numPublicInputs = proof_inputs.length / num_proofs;
        uint256[] memory entropy = new uint256[](num_proofs);
        inputAccumulators = new uint256[](numPublicInputs + 1);

        for (uint256 proofNumber = 0; proofNumber < num_proofs; proofNumber++) {
            if (proofNumber == 0) {
                entropy[proofNumber] = 1;
            } else {
                entropy[proofNumber] =
                    uint256(blockhash(block.number - proofNumber)) %
                    q;
            }
            require(entropy[proofNumber] != 0, "Entropy should not be zero");
            // here multiplication by 1 is implied
            inputAccumulators[0] = addmod(
                inputAccumulators[0],
                entropy[proofNumber],
                q
            );
            for (uint256 i = 0; i < numPublicInputs; i++) {
                // accumulate the exponent with extra entropy mod q
                inputAccumulators[i + 1] = addmod(
                    inputAccumulators[i + 1],
                    mulmod(
                        entropy[proofNumber],
                        proof_inputs[proofNumber * numPublicInputs + i],
                        q
                    ),
                    q
                );
            }
            // coefficient for +vk.alpha (mind +) is the same as inputAccumulator[0]
        }

        // inputs for scalar multiplication
        uint256[3] memory mul_input;
        bool success;

        // use scalar multiplications to get proof.A[i] * entropy[i]

        proofsAandC = new uint256[](num_proofs * 2 + 2);

        proofsAandC[0] = in_proof[0];
        proofsAandC[1] = in_proof[1];

        for (uint256 proofNumber = 1; proofNumber < num_proofs; proofNumber++) {
            mul_input[0] = in_proof[proofNumber * 8];
            mul_input[1] = in_proof[proofNumber * 8 + 1];
            mul_input[2] = entropy[proofNumber];
            assembly {
                // ECMUL, output proofsA[i]
                success := staticcall(
                    sub(gas(), 2000),
                    7,
                    mul_input,
                    0x60,
                    mul_input,
                    0x40
                )
            }
            proofsAandC[proofNumber * 2] = mul_input[0];
            proofsAandC[proofNumber * 2 + 1] = mul_input[1];
            require(success, "Failed to call a precompile");
        }

        // use scalar multiplication and addition to get sum(proof.C[i] * entropy[i])

        uint256[4] memory add_input;

        add_input[0] = in_proof[6];
        add_input[1] = in_proof[7];

        for (uint256 proofNumber = 1; proofNumber < num_proofs; proofNumber++) {
            mul_input[0] = in_proof[proofNumber * 8 + 6];
            mul_input[1] = in_proof[proofNumber * 8 + 7];
            mul_input[2] = entropy[proofNumber];
            assembly {
                // ECMUL, output proofsA
                success := staticcall(
                    sub(gas(), 2000),
                    7,
                    mul_input,
                    0x60,
                    add(add_input, 0x40),
                    0x40
                )
            }
            require(
                success,
                "Failed to call a precompile for G1 multiplication for Proof C"
            );

            assembly {
                // ECADD from two elements that are in add_input and output into first two elements of add_input
                success := staticcall(
                    sub(gas(), 2000),
                    6,
                    add_input,
                    0x80,
                    add_input,
                    0x40
                )
            }
            require(
                success,
                "Failed to call a precompile for G1 addition for Proof C"
            );
        }

        proofsAandC[num_proofs * 2] = add_input[0];
        proofsAandC[num_proofs * 2 + 1] = add_input[1];
    }

    function prepareBatches(
        uint256[14] memory in_vk,
        uint256[] memory vk_gammaABC,
        uint256[] memory inputAccumulators
    ) internal view returns (uint256[4] memory finalVksAlphaX) {
        // Compute the linear combination vk_x using accumulator
        // First two fields are used as the sum and are initially zero
        uint256[4] memory add_input;
        uint256[3] memory mul_input;
        bool success;

        // Performs a sum(gammaABC[i] * inputAccumulator[i])
        for (uint256 i = 0; i < inputAccumulators.length; i++) {
            mul_input[0] = vk_gammaABC[2 * i];
            mul_input[1] = vk_gammaABC[2 * i + 1];
            mul_input[2] = inputAccumulators[i];

            assembly {
                // ECMUL, output to the last 2 elements of `add_input`
                success := staticcall(
                    sub(gas(), 2000),
                    7,
                    mul_input,
                    0x60,
                    add(add_input, 0x40),
                    0x40
                )
            }
            require(
                success,
                "Failed to call a precompile for G1 multiplication for input accumulator"
            );

            assembly {
                // ECADD from four elements that are in add_input and output into first two elements of add_input
                success := staticcall(
                    sub(gas(), 2000),
                    6,
                    add_input,
                    0x80,
                    add_input,
                    0x40
                )
            }
            require(
                success,
                "Failed to call a precompile for G1 addition for input accumulator"
            );
        }

        finalVksAlphaX[2] = add_input[0];
        finalVksAlphaX[3] = add_input[1];

        // add one extra memory slot for scalar for multiplication usage
        uint256[3] memory finalVKalpha;
        finalVKalpha[0] = in_vk[0];
        finalVKalpha[1] = in_vk[1];
        finalVKalpha[2] = inputAccumulators[0];

        assembly {
            // ECMUL, output to first 2 elements of finalVKalpha
            success := staticcall(
                sub(gas(), 2000),
                7,
                finalVKalpha,
                0x60,
                finalVKalpha,
                0x40
            )
        }
        require(success, "Failed to call a precompile for G1 multiplication");
        finalVksAlphaX[0] = finalVKalpha[0];
        finalVksAlphaX[1] = finalVKalpha[1];
    }

    // original equation 
    // e(proof.A, proof.B)*e(-vk.alpha, vk.beta)*e(-vk_x, vk.gamma)*e(-proof.C, vk.delta) == 1
    // accumulation of inputs
    // gammaABC[0] + sum[ gammaABC[i+1]^proof_inputs[i] ]
    
    function BatchVerify(
        uint256[14] memory in_vk,
        uint256[] memory vk_gammaABC,
        uint256[] memory in_proof,
        uint256[] memory proof_inputs,
        uint256 num_proofs
    ) internal view returns (bool) {
        require(
            in_proof.length == num_proofs * 8,
            "Invalid proofs length for a batch"
        );
        require(
            proof_inputs.length % num_proofs == 0,
            "Invalid inputs length for a batch"
        );
        require(
            ((vk_gammaABC.length / 2) - 1) == proof_inputs.length / num_proofs
        );

        // strategy is to accumulate entropy separately for some proof elements
        // (accumulate only for G1, can't in G2) of the pairing equation, as well as input verification key,
        // postpone scalar multiplication as much as possible and check only one equation
        // by using 3 + num_proofs pairings only plus 2*num_proofs + (num_inputs+1) + 1 scalar multiplications compared to naive
        // 4*num_proofs pairings and num_proofs*(num_inputs+1) scalar multiplications

        uint256[] memory proofsAandC;
        uint256[] memory inputAccumulators;
        (proofsAandC, inputAccumulators) = accumulate(
            in_proof,
            proof_inputs,
            num_proofs
        );

        uint256[4] memory finalVksAlphaX = prepareBatches(
            in_vk,
            vk_gammaABC,
            inputAccumulators
        );

        uint256[] memory inputs = new uint256[](6 * num_proofs + 18);
        // first num_proofs pairings e(ProofA, ProofB)
        for (uint256 proofNumber = 0; proofNumber < num_proofs; proofNumber++) {
            inputs[proofNumber * 6] = proofsAandC[proofNumber * 2];
            inputs[proofNumber * 6 + 1] = proofsAandC[proofNumber * 2 + 1];
            inputs[proofNumber * 6 + 2] = in_proof[proofNumber * 8 + 2];
            inputs[proofNumber * 6 + 3] = in_proof[proofNumber * 8 + 3];
            inputs[proofNumber * 6 + 4] = in_proof[proofNumber * 8 + 4];
            inputs[proofNumber * 6 + 5] = in_proof[proofNumber * 8 + 5];
        }

        // second pairing e(-finalVKaplha, vk.beta)
        inputs[num_proofs * 6] = finalVksAlphaX[0];
        inputs[num_proofs * 6 + 1] = NegateY(finalVksAlphaX[1]);
        inputs[num_proofs * 6 + 2] = in_vk[2];
        inputs[num_proofs * 6 + 3] = in_vk[3];
        inputs[num_proofs * 6 + 4] = in_vk[4];
        inputs[num_proofs * 6 + 5] = in_vk[5];

        // third pairing e(-finalVKx, vk.gamma)
        inputs[num_proofs * 6 + 6] = finalVksAlphaX[2];
        inputs[num_proofs * 6 + 7] = NegateY(finalVksAlphaX[3]);
        inputs[num_proofs * 6 + 8] = in_vk[6];
        inputs[num_proofs * 6 + 9] = in_vk[7];
        inputs[num_proofs * 6 + 10] = in_vk[8];
        inputs[num_proofs * 6 + 11] = in_vk[9];

        // fourth pairing e(-proof.C, finalVKdelta)
        inputs[num_proofs * 6 + 12] = proofsAandC[num_proofs * 2];
        inputs[num_proofs * 6 + 13] = NegateY(proofsAandC[num_proofs * 2 + 1]);
        inputs[num_proofs * 6 + 14] = in_vk[10];
        inputs[num_proofs * 6 + 15] = in_vk[11];
        inputs[num_proofs * 6 + 16] = in_vk[12];
        inputs[num_proofs * 6 + 17] = in_vk[13];

        uint256 inputsLength = inputs.length * 32;
        uint256[1] memory out;
        require(
            inputsLength % 192 == 0,
            "Inputs length should be multiple of 192 bytes"
        );

        bool success;
        assembly {
            success := staticcall(
                sub(gas(), 2000),
                8,
                add(inputs, 0x20),
                inputsLength,
                out,
                0x20
            )
        }
        return out[0] == 1;
    }
}

contract Wrapper {
    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 7458776491624931501419031866027938086551718311768338226201082579207053144477;
    uint256 constant deltax2 = 13308168148538590002644095535134305921943562516332364578441592808457002325380;
    uint256 constant deltay1 = 2776864814383485517632643235353203778244491650598350749629320405015898985133;
    uint256 constant deltay2 = 18298917945199454234702010635091162479791601153163142972676401036446693891041;

    
    uint256 constant IC0x = 17796696687012553848863015271083944277965165167383839165539592831853440448813;
    uint256 constant IC0y = 10607211620141126422228090047063090850612127089327705267735296968472635145130;
    
    uint256 constant IC1x = 2435835972275252073333092905969587877683201564142393258736549397349205704509;
    uint256 constant IC1y = 4652004586296933016410752603709338452159050156778174114575665865724641453572;
    
    uint256 constant IC2x = 5215391626157538422472676076358667489347370235611629023771451358668711029540;
    uint256 constant IC2y = 5538147147907220093215843266172455223705366233228281965359683600466699028755;
    
    uint256 constant IC3x = 3579819876009412481277648422639768542511731726322259024601275162857011910199;
    uint256 constant IC3y = 11659343533952181116687607870302071323949266132279370007564161093336322491603;
    
    uint256 constant IC4x = 8585111713435093231016580698335034170146388813173171673309523591845792441240;
    uint256 constant IC4y = 15415224749804741080454950689593520528708983189112197415083365951600903851326;
    
    uint256 constant IC5x = 11199000423106400024382061700479005910649626191813930138258338882277739873422;
    uint256 constant IC5y = 7067050456857618837883213986277433959126160693124093719501388441417927813286;
    
    uint256 constant IC6x = 8285055247081521393947602342419229673274242924082309875689793836560778882514;
    uint256 constant IC6y = 11620494059261466682783848887972920274962768872939948647550499693847993882104;
    
    uint256 constant IC7x = 14548473489560862810344885527453611370197228133570820362380048528856550741088;
    uint256 constant IC7y = 1800064497078986649055686735844827166747645593217590572264645475794315674949;
    
    uint256 constant IC8x = 18681954475280450301558060076813718952202983307568627932010043396628002283897;
    uint256 constant IC8y = 21593350834334312382312069241968724543269866879285041183279950755552601328247;
    
    uint256 constant IC9x = 3521085809833687376794385224973905943607227803514512808297023205638212235755;
    uint256 constant IC9y = 7179840688550444038529238203787710620278025099669378406882930269809409050190;
    

    function getInVk() internal pure returns (uint256[14] memory) {
        return [
            alphax, alphay,
            betax1, betax2, betay1, betay2,
            gammax1, gammax2, gammay1, gammay2,
            deltax1, deltax2, deltay1, deltay2
        ];
    }

    function getVkGammaABC() internal pure returns (uint256[] memory) {
        uint256[] memory result = new uint256[](20);
        
        result[0] = IC0x;
        result[1] = IC0y;
        
        result[2] = IC1x;
        result[3] = IC1y;
        
        result[4] = IC2x;
        result[5] = IC2y;
        
        result[6] = IC3x;
        result[7] = IC3y;
        
        result[8] = IC4x;
        result[9] = IC4y;
        
        result[10] = IC5x;
        result[11] = IC5y;
        
        result[12] = IC6x;
        result[13] = IC6y;
        
        result[14] = IC7x;
        result[15] = IC7y;
        
        result[16] = IC8x;
        result[17] = IC8y;
        
        result[18] = IC9x;
        result[19] = IC9y;
        
        return result;
    }

    function verifyBatch(
        uint256[] calldata in_proof,
        uint256[] calldata proof_inputs,
        uint256 num_proofs
    ) 
    public
    view
    returns (bool success) {
        return BatchVerifier.BatchVerify(getInVk(), getVkGammaABC(), in_proof, proof_inputs, num_proofs);
    }
}