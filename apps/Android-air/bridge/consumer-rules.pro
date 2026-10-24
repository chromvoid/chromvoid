# UniFFI reaches the generated bindings and JNA callbacks reflectively.
-keep class com.chromvoid.air.ffi.** { *; }
# JNA's Android AAR includes optional desktop AWT helpers. AWT is absent on
# Android; JNA documents this rule for Android consumers:
# https://github.com/java-native-access/jna/blob/master/www/FrequentlyAskedQuestions.md#jna-on-android
-dontwarn java.awt.*
-keep class com.sun.jna.** { *; }
-keepclassmembers class * extends com.sun.jna.** { public *; }
