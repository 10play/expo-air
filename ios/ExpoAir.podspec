require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoAir'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/10play/expo-air' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'React-RCTAppDelegate'

  s.frameworks = 'PhotosUI'

  bundle_path = File.join(__dir__, 'widget.jsbundle')
  if File.exist?(bundle_path)
    s.resource = 'widget.jsbundle'
  end

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'HEADER_SEARCH_PATHS' => '"$(PODS_ROOT)/Headers/Public/React-RCTAppDelegate" "$(PODS_ROOT)/Headers/Public/ReactAppDependencyProvider" "$(PODS_ROOT)/Headers/Public/React-defaultsnativemodule" "$(PODS_ROOT)/Headers/Public/ReactCommon" "$(PODS_ROOT)/Headers/Public/React-NativeModulesApple" "$(PODS_ROOT)/Headers/Public/React-callinvoker" "$(PODS_ROOT)/Headers/Public/React-featureflags"',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
