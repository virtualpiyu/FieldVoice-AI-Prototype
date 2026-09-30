#cd .\backend

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.organizations import router as organizations_router
from app.api.users import router as users_router
from app.database import engine
from app.api.auth import router as auth_router
from app.api.territories import router as territories_router
from app.api.customers import router as customers_router
from app.api.visits import router as visits_router
from app.api.voice_notes import router as voice_notes_router
from fastapi.staticfiles import StaticFiles
from app.api.ai_intelligence import router as ai_intelligence_router
from app.api.reports import router as reports_router
from app.api.leads import router as leads_router   
from app.api.dashboard import router as dashboard_router
from app.api.executive_intelligence import router as executive_intelligence_router



app = FastAPI(
    title="FieldVoice AI API",
    version="0.1.0",
    description="Backend prototype for FieldVoice AI",
)


# Development CORS
# We will restrict this before production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Organization API
app.include_router(organizations_router)

# Users API
app.include_router(users_router)

#Authentication API
app.include_router(auth_router)

# Territories API
app.include_router(territories_router)

#Customers API
app.include_router(customers_router)

#Visits API
app.include_router(visits_router)

# Voice Notes API
app.include_router(voice_notes_router)

# Other AI Intelligence Imports
app.include_router(ai_intelligence_router)

# Reports API
app.include_router(reports_router)

# Leads API
app.include_router(leads_router)

#Dashboard API
app.include_router(dashboard_router)
app.include_router(executive_intelligence_router)


# Static files for upload Voice notes 
app.mount(
    "/uploads",
    StaticFiles(directory="app/uploads"),
    name="uploads",
)

@app.get("/")
async def root():
    return {
        "message": "FieldVoice AI API is running",
        "version": "0.1.0",
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "fieldvoice-ai",
    }


@app.get("/db-test")
async def db_test():
    try:
        with engine.connect():
            return {
                "status": "ok",
                "database": "connected",
            }

    except Exception as e:
        return {
            "status": "error",
            "database": "connection_failed",
            "detail": str(e),
        }