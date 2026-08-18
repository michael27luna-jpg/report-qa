from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()  # carga GOOGLE_API_KEY desde .env

llm = ChatGoogleGenerativeAI(model="gemini-flash-latest", max_tokens=200)
resp = llm.invoke("Responde en una sola línea: ¿estás conectado?")
print(resp.content)