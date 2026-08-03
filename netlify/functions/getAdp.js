const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    const response = await fetch("https://www.rotowire.com/football/tables/adp.php?pos=ALL&scoring=PPR", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: "Rotowire fetch failed" }) };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
