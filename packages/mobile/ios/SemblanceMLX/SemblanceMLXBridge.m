// SemblanceMLXBridge — Objective-C bridge for exposing the Swift MLX module to React Native.
// React Native requires Objective-C macros to register native modules.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(SemblanceMLX, NSObject)

RCT_EXTERN_METHOD(loadModel:(NSString *)modelPath
                  contextLength:(NSInteger)contextLength
                  batchSize:(NSInteger)batchSize
                  threads:(NSInteger)threads
                  gpuLayers:(NSInteger)gpuLayers
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(unloadModel:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isModelLoaded:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generate:(NSString *)prompt
                  maxTokens:(NSInteger)maxTokens
                  temperature:(double)temperature
                  systemPrompt:(NSString *)systemPrompt
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(embed:(NSString *)text
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getMemoryUsage:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPlatform:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
