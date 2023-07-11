import { authorize } from './authorize';
import { createClient, Client as LiveblocksClient, LiveList, Lson } from '@liveblocks/client';
import { createClient as createPgClient, SupabaseClient } from '@supabase/supabase-js';

export interface Env {
	LiveWorker: DurableObjectNamespace;
	SUPABASE_URL: string;
	SUPABASE_KEY: string;
	LIVEBLOCKS_SECRET: string;
}

export class LiveWorker {
	initializedLiveblock: boolean;
	lbClient?: LiveblocksClient;
	pgClient?: SupabaseClient;
	state: DurableObjectState;
	env: Env;

	constructor(state: DurableObjectState, env: Env) {
		this.initializedLiveblock = false;
		this.state = state;
		this.env = env;
	}

	createPg() {
		const supabase = createPgClient(this.env.SUPABASE_URL, this.env.SUPABASE_KEY, { auth: { persistSession: false } });
		this.pgClient = supabase;
	}

	//flushes data
	async syncDb(roomid: string, todos: LiveList<Lson>) {
		//todo add a guard, to avoid overriding,
		const res = await this.pgClient!.from('todos').upsert(
			{ room_id: roomid, todos: JSON.stringify(todos.toImmutable()) },
			{ onConflict: 'room_id' }
		);

		if (res.error) {
			console.log(res.error);
		}
	}

	async initializeLiveblocksClient(roomId: string) {
		this.initializedLiveblock = true;

		this.lbClient = createClient({
			authEndpoint: async (roomId) => {
				const res = await authorize({
					room: roomId,
					secret: this.env.LIVEBLOCKS_SECRET,
					userId: `wokrer${roomId}`,
					userInfo: {
						bot: true,
					},
				});
				return JSON.parse(res.body) as any;
			},
		});

		try {
			const room = this.lbClient.enter(roomId, {
				initialPresence: { isTyping: false },
				initialStorage: { todos: new LiveList() },
				shouldInitiallyConnect: true,
			});

			const { root } = await room.getStorage();
			let todos = root.get('todos');

			await this.syncDb(roomId, todos);

			room.subscribe(todos, async () => {
				await this.syncDb(roomId, todos);
			});

			room.subscribe('others', (other) => {
				if (other.length < 1) {
					console.log(`destroying room!`);
					this.initializedLiveblock = false;
					//@ts-ignore
					room.destroy();
				}
			});

			room.subscribe('error', (e: any) => {
				console.log(e);
			});
			room.subscribe(root, (root) => {
				console.log(root);
			});

			room.subscribe('lost-connection', (event) => {
				switch (event) {
					case 'lost':
						console.warn('Still trying to reconnect...');
						break;

					case 'restored':
						console.log('Successfully reconnected again!');
						break;

					case 'failed':
						console.error('Could not restore the connection');
						break;
				}
			});

			room.subscribe('status', (status) => {
				// Do something
				console.log(status);
			});
		} catch (error) {
			console.log(error);
		}
	}

	async init(roomId: string) {
		this.createPg();
		this.initializeLiveblocksClient(roomId);
	}

	async fetch(req: Request) {
		let { searchParams } = new URL(req.url);

		const roomId = searchParams.get('roomId');

		//If both usserId & roomId are present, we'll return a token for the user
		const userId = searchParams.get('userId');

		if (userId) {
			const res = await authorize({
				room: roomId!,
				secret: this.env.LIVEBLOCKS_SECRET,
				userId: userId,
			});

			return new Response(res.body, { headers: { 'Access-Control-Allow-Origin': '*' } });
		}

		//if the client is already initialized. return
		if (this.initializedLiveblock) return new Response(`Not Evicted ${this.state.id}`);

		try {
			await this.init(roomId!);
		} catch (error) {
			console.log(error);
		}

		return new Response(`Status Ok ${this.state.id}`);
	}
}

async function handleApiRequest(request: Request, env: Env) {
	let { searchParams } = new URL(request.url);

	const roomId = searchParams.get('roomId');

	if (!roomId) {
		return new Response('Not Found', { status: 404 });
	}
	return env.LiveWorker.get(env.LiveWorker.idFromName(roomId)).fetch(request.url, request);
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return await handleApiRequest(request, env);
	},
};
