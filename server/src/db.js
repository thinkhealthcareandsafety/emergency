import mongoose from 'mongoose';

let memoryServer = null;

export async function connectDb(uri) {
  let finalUri = uri;
  if (uri === 'memory') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    finalUri = memoryServer.getUri('ert');
    console.log('[db] Using in-memory MongoDB — demo mode, data resets on restart. Set MONGO_URI for real use.');
  }
  await mongoose.connect(finalUri);
  console.log('[db] Connected');
  return { inMemory: Boolean(memoryServer) };
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
