# React Native
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}
-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
    void set*(***);
    *** get*();
}

# Hermes engine
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# SemblanceLlamaModule — JNI native methods must not be stripped
-keep class com.semblance.llm.SemblanceLlamaModule { *; }
-keepclassmembers class com.semblance.llm.SemblanceLlamaModule {
    native <methods>;
}

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }

# React Native Gesture Handler
-keep class com.swmansion.gesturehandler.** { *; }

# op-sqlite
-keep class com.op.sqlite.** { *; }

# Suppress warnings for React Native internals
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**
