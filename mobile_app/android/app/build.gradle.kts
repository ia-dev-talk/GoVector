import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

val releaseSigningConfigured = listOf(
    "storeFile",
    "storePassword",
    "keyAlias",
    "keyPassword",
).all { !keystoreProperties.getProperty(it).isNullOrBlank() }

val pilotSigning = providers.gradleProperty("pilotSigning").orNull
    ?.equals("true", ignoreCase = true) == true

android {
    namespace = "dev.bigdataai.bluevector"
    // flutter_plugin_android_lifecycle currently requires API 36 metadata.
    // compileSdk is independent from targetSdk/runtime behaviour.
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17

        // Syntaxe Kotlin DSL pour activer le desugaring
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "dev.bigdataai.bluevector"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            when {
                releaseSigningConfigured -> {
                    signingConfig = signingConfigs.getByName("release")
                }
                pilotSigning -> {
                    // CI/test builds may opt in explicitly to debug signing.
                    signingConfig = signingConfigs.getByName("debug")
                }
                // Without production signing credentials the release remains unsigned,
                // preventing an accidental debug-signed production artifact.
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// Ajout de la dépendance de desugaring avec la syntaxe Kotlin DSL
dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
