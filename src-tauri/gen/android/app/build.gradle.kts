import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val fossBuild = providers.environmentVariable("SABLE_FOSS").orNull == "1"

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "moe.sable.client"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "moe.sable.client"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
        // Not an app flavour: that would change the output paths tauri-build.yml globs.
        missingDimensionStrategy("push", if (fossBuild) "foss" else "gms")
    }
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            packaging {
                jniLibs.useLegacyPackaging = true
            }
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    compileOptions {
        // tauri-plugin-livekit-mobile requires it: LiveKit/WebRTC call java.time
        // APIs that only exist from API 26, and minSdk here is 24.
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

// tink (via the unifiedpush connector) pulls protobuf-java, which collides with
// the protobuf-javalite livekit-android is generated against: its Timestamp
// extends GeneratedMessage rather than GeneratedMessageLite, so livekit's
// classes fail dex verification at runtime. tink-android shades its own
// protobuf and needs none, which leaves javalite as the only protobuf.
configurations.all {
    resolutionStrategy.dependencySubstitution {
        substitute(module("com.google.crypto.tink:tink"))
            .using(module("com.google.crypto.tink:tink-android:1.18.0"))
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")

// tauri-cli writes plugin config keys in random order; sort for reproducible builds.
val sortTauriConfig by tasks.registering {
    val config = file("src/main/assets/tauri.conf.json")
    doLast {
        if (!config.exists()) return@doLast
        fun sorted(value: Any?): Any? = when (value) {
            is Map<*, *> -> value.entries.sortedBy { it.key as String }.associate { it.key to sorted(it.value) }
            is List<*> -> value.map(::sorted)
            else -> value
        }
        config.writeText(groovy.json.JsonOutput.toJson(sorted(groovy.json.JsonSlurper().parse(config))))
    }
}
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
    dependsOn(sortTauriConfig)
}

// Native FCM push (Sygnal): applies only once google-services.json is added to this
// directory, so builds without Firebase configured still succeed.
// Skipped for FOSS builds: the plugin injects the Firebase project ids as string
// resources even when no Firebase library is linked.
if (!fossBuild && file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}
