// bitnet-stubs.cpp — Stub implementations for BitNet interface functions
// when neither GGML_BITNET_ARM_TL1 nor GGML_BITNET_X86_TL2 is defined.
//
// The ggml-bitnet-lut.cpp file wraps ALL interface functions behind
// #if defined(GGML_BITNET_ARM_TL1) / #if defined(GGML_BITNET_X86_TL2).
// When both are OFF (MAD-only build for multi-model support), the functions
// declared in ggml-bitnet.h have no definitions, causing linker errors or
// crashes from unresolved symbols.
//
// These stubs provide safe no-op implementations that allow the build to
// link and the MAD kernel path in ggml.c to handle i2_s inference directly
// via the vec_dot functions in ggml-bitnet-mad.cpp.

#if !defined(GGML_BITNET_ARM_TL1) && !defined(GGML_BITNET_X86_TL2)

#include "ggml-bitnet.h"
#include <cstddef>

void ggml_bitnet_init(void) {
    // No-op: MAD kernels don't need initialization
}

void ggml_bitnet_free(void) {
    // No-op: nothing to free
}

bool ggml_bitnet_can_mul_mat(const struct ggml_tensor * /*src0*/, const struct ggml_tensor * /*src1*/, const struct ggml_tensor * /*dst*/) {
    // Return false: MAD path is handled directly in ggml.c's compute_forward,
    // not through the bitnet_mul_mat interface (which is TL1/TL2 only).
    return false;
}

size_t ggml_bitnet_mul_mat_get_wsize(const struct ggml_tensor * /*src0*/, const struct ggml_tensor * /*src1*/, const struct ggml_tensor * /*dst*/) {
    return 0;
}

void ggml_bitnet_mul_mat_task_init(void * /*src1*/, void * /*qlut*/, void * /*lut_scales*/, void * /*lut_biases*/, int /*n*/, int /*k*/, int /*m*/, int /*bits*/) {
    // No-op
}

void ggml_bitnet_mul_mat_task_compute(void * /*src0*/, void * /*scales*/, void * /*qlut*/, void * /*lut_scales*/, void * /*lut_biases*/, void * /*dst*/, int /*n*/, int /*k*/, int /*m*/, int /*bits*/) {
    // No-op
}

void ggml_bitnet_transform_tensor(struct ggml_tensor * /*tensor*/) {
    // No-op: MAD kernels work directly on the raw i2_s tensor data
    // without needing weight transformation/repacking.
}

int ggml_bitnet_get_type_bits(enum ggml_type type) {
    // i2_s is 2 bits per weight
    (void)type;
    return 2;
}

void ggml_bitnet_set_n_threads(int /*n_threads*/) {
    // No-op
}

#endif // !GGML_BITNET_ARM_TL1 && !GGML_BITNET_X86_TL2
