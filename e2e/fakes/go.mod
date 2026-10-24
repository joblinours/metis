module github.com/trymetis/metis/e2e/fakes

go 1.27.2

require (
	connectrpc.com/connect/v2 v2.0.1
	github.com/trymetis/metis/apps/updater v0.0.0
	google.golang.org/protobuf v1.36.12
)

replace github.com/trymetis/metis/apps/updater => ../../apps/updater
