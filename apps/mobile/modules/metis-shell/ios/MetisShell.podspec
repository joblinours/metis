Pod::Spec.new do |s|
  s.name           = 'MetisShell'
  s.version        = '1.0.0'
  s.summary        = 'Webview storage controls for the Metis Suite app'
  s.description    = 'Webview storage controls for the Metis Suite app'
  s.author         = 'Metis Suite'
  s.homepage       = 'https://github.com/trymetis/metis'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
