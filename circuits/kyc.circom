pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Prototype policy: the accepted issuer publishes issuerRoot out of band.
// The credential leaf is Poseidon(secret, verified, expiryDay).
// Three levels allow eight issued leaves. No issuer signature or revocation check.
template PrivateKYC() {
    signal input secret;
    signal input verified;
    signal input expiryDay;
    signal input pathElements[3];
    signal input pathIndices[3];
    signal input issuerRoot;
    signal input currentDay;

    component expiryBits = Num2Bits(32);
    expiryBits.in <== expiryDay;
    component dayBits = Num2Bits(32);
    dayBits.in <== currentDay;
    verified === 1;

    component inDate = LessThan(32);
    inDate.in[0] <== expiryDay;
    inDate.in[1] <== currentDay;
    inDate.out === 0;

    component leaf = Poseidon(3);
    leaf.inputs[0] <== secret;
    leaf.inputs[1] <== verified;
    leaf.inputs[2] <== expiryDay;

    signal nodes[4];
    nodes[0] <== leaf.out;
    component hashes[3];
    for (var i = 0; i < 3; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        hashes[i] = Poseidon(2);
        hashes[i].inputs[0] <== nodes[i] + pathIndices[i] * (pathElements[i] - nodes[i]);
        hashes[i].inputs[1] <== pathElements[i] + pathIndices[i] * (nodes[i] - pathElements[i]);
        nodes[i + 1] <== hashes[i].out;
    }
    nodes[3] === issuerRoot;
}

component main {public [issuerRoot, currentDay]} = PrivateKYC();
