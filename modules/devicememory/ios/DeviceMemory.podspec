Pod::Spec.new do |s|
  s.name           = 'DeviceMemory'
  s.version        = '1.0.0'
  s.summary        = 'Reads an on-demand app memory snapshot for local model preflight'
  s.description    = 'Exposes available and physical memory for safe on-device model loading.'
  s.license        = 'MIT'
  s.author         = 'AI Hat'
  s.homepage       = 'https://github.com/aman-mohammed-max/aihat'
  s.platforms      = { :ios => '13.0' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/aman-mohammed-max/aihat.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
end
