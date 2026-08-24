function run<T>(data: T | undefined, exec: (data: T)=>void) {
	if (data) {
		exec(data);
	}
}


export function recvMessage(msg: protobuf.ReflectedMessage) {
	run(msg.createAccountResult, d => {
		console.log(d.success);
	});

	run(msg.loginResult, d => {
		console.log(d.success);
	});
}

