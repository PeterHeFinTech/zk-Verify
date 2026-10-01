pragma circom 2.1.6;
include "kyc_template.circom";

// Versioned separately from legacy KYC. Public witness order is regression-tested.
// context is a server-issued request digest; response binds it to the leaf secret.
template SessionKYC(depth) {
    signal output response;
    signal input issuerRoot;
    signal input currentDay;
    signal input context;
    signal input secret;
    signal input verified;
    signal input expiryDay;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    component membership = PrivateKYC(depth);
    membership.issuerRoot <== issuerRoot;
    membership.currentDay <== currentDay;
    membership.secret <== secret;
    membership.verified <== verified;
    membership.expiryDay <== expiryDay;
    for (var i=0; i<depth; i++) {
        membership.pathElements[i] <== pathElements[i];
        membership.pathIndices[i] <== pathIndices[i];
    }
    component binding = Poseidon(3);
    binding.inputs[0] <== 20261001; // session-response domain/version
    binding.inputs[1] <== secret;
    binding.inputs[2] <== context;
    response <== binding.out;
}
component main {public [issuerRoot,currentDay,context]} = SessionKYC(3);
