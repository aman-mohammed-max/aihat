Pod::Spec.new do |s|
  s.name           = 'Phonon'
  s.version        = '1.0.0'
  s.summary        = 'Phonon-2 speech recognition on the device (Core ML)'
  s.description    = 'Runs Fermion Research’s Phonon-2 English speech recognition model on the Neural Engine, for AI Hat’s dictation.'
  s.license        = 'Apache-2.0'
  s.author         = 'AI Hat'
  s.homepage       = 'https://github.com/aman-mohammed-max/aihat'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/aman-mohammed-max/aihat.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # PhononCoreML/ is Fermion Research's phonon-coreml package (Apache-2.0, LICENSE-phonon-coreml); its greedy decoder is
  # the prebuilt PhononTDT library, declared in phonon2_tdt.h.
  s.source_files = '*.{h,swift}', 'PhononCoreML/*.swift'
  s.vendored_frameworks = 'Frameworks/PhononTDT.xcframework'
  s.frameworks = 'CoreML', 'Accelerate', 'AVFoundation'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
