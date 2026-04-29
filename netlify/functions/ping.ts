export const handler = async (event: any) => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      status: "ok", 
      message: "Netlify Functions are working!",
      path: event.path,
      method: event.httpMethod
    })
  };
};
