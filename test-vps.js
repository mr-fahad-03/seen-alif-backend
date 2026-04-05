import axios from 'axios';

const testVPS = async () => {
  const vpsUrl = 'https://langaimodel.grabatoz.ae/api/translate/en-ar';
  
  console.log('Testing single translation...');
  try {
    const res1 = await axios.post(vpsUrl, { text: 'Laptops' });
    console.log('Single Response Data:', JSON.stringify(res1.data, null, 2));
  } catch (err) {
    console.error('Single Error:', err.message);
  }

  console.log('\nTesting batch translation...');
  try {
    const res2 = await axios.post(vpsUrl, { texts: ['Laptops', 'Desktops'] });
    console.log('Batch Response Data:', JSON.stringify(res2.data, null, 2));
  } catch (err) {
    console.error('Batch Error:', err.message);
  }
};

testVPS();
