import CloudNode from '@ulixee/cloud';

// Create CloudNode with port configuration
const cloud = new CloudNode({
  port: 1818,
  host: 'localhost'
});

async function start() {
  console.log('🚀 Starting Ulixee Cloud server...');
  
  await cloud.listen();
  
  const address = await cloud.address;
  console.log(`✅ Ulixee Cloud server is running on ${address}`);
  console.log('📋 Press Ctrl+C to stop the server');
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down Ulixee Cloud server...');
    await cloud.close();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down Ulixee Cloud server...');
    await cloud.close();
    process.exit(0);
  });
}

start().catch(error => {
  console.error('❌ Failed to start Ulixee Cloud server:', error);
  process.exit(1);
});

