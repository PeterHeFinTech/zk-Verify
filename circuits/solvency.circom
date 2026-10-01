pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "bounded_count.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Each value is in [0, 2^32). Totals fit in 35 bits for eight slots.
// This checks committed numbers only; ownership and completeness are external.
template PrivateSolvency() {
    signal input assets[8];
    signal input liabilities[8];
    signal input assetCount;
    signal input liabilityCount;
    signal input assetRoot;
    signal input liabilityRoot;

    component assetHash = Poseidon(8);
    component liabilityHash = Poseidon(8);
    component assetRange[8];
    component liabilityRange[8];
    component assetActive[8];
    component liabilityActive[8];
    signal assetFlags[8];
    signal liabilityFlags[8];
    signal assetSums[9];
    signal liabilitySums[9];
    assetSums[0] <== 0;
    liabilitySums[0] <== 0;

    component assetLimit = BoundedCount8();
    assetLimit.count <== assetCount;
    component liabilityLimit = BoundedCount8();
    liabilityLimit.count <== liabilityCount;

    for (var i = 0; i < 8; i++) {
        assetHash.inputs[i] <== assets[i];
        liabilityHash.inputs[i] <== liabilities[i];
        assetRange[i] = Num2Bits(32);
        assetRange[i].in <== assets[i];
        liabilityRange[i] = Num2Bits(32);
        liabilityRange[i].in <== liabilities[i];

        assetActive[i] = LessThan(4);
        assetActive[i].in[0] <== i;
        assetActive[i].in[1] <== assetCount;
        assetFlags[i] <== assetActive[i].out;
        liabilityActive[i] = LessThan(4);
        liabilityActive[i].in[0] <== i;
        liabilityActive[i].in[1] <== liabilityCount;
        liabilityFlags[i] <== liabilityActive[i].out;
        (1 - assetFlags[i]) * assets[i] === 0;
        (1 - liabilityFlags[i]) * liabilities[i] === 0;
        assetSums[i + 1] <== assetSums[i] + assets[i];
        liabilitySums[i + 1] <== liabilitySums[i] + liabilities[i];
    }
    assetHash.out === assetRoot;
    liabilityHash.out === liabilityRoot;

    component compare = LessThan(36);
    compare.in[0] <== assetSums[8];
    compare.in[1] <== liabilitySums[8];
    compare.out === 0;
}

component main {public [assetRoot, liabilityRoot, assetCount, liabilityCount]} = PrivateSolvency();
