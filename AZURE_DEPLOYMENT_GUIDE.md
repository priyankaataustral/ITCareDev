# 🚀 Azure Deployment Guide

## Critical Fixes Applied ✅

### 1. **Fixed requirements.txt** 
- Removed corrupted encoding characters
- Clean package list now ready for pip install

### 2. **Fixed startup.sh**
- Corrected shebang from `#!/bin/baut` to `#!/bin/bash`

### 3. **Fixed OPENAI_API_KEY crash**
- App no longer crashes if OPENAI_API_KEY is missing
- AI features will be disabled gracefully

## 🔧 Required Azure App Service Settings

Set these environment variables in **Configuration → Application Settings**:

### **Essential Settings:**
```
DATABASE_URL = mysql+pymysql://username:password@servername.mysql.database.azure.com:3306/databasename?ssl_ca=path/to/ca-cert.pem
FRONTEND_ORIGINS = https://your-frontend-url.azurestaticapps.net
JWT_SECRET = your-jwt-secret-key
```

### **Optional Settings:**
```
OPENAI_API_KEY = your-openai-api-key (for AI features)
SMTP_USER = your-email@gmail.com (for email sending)
SMTP_PASS = your-app-password (for email sending)
DEMO_MODE = true (to disable real email sending)
LOG_LEVEL = INFO
```

## 📋 Deployment Steps

### 1. **Push Code Changes**
```bash
git add .
git commit -m "Fix: Azure deployment issues - requirements.txt, startup.sh, config"
git push
```

### 2. **Configure Azure Web App**
- Go to **Azure Portal → Your Web App**
- **Configuration → Application Settings**
- Add the environment variables above
- **Save** and **Restart** the app

### 3. **Monitor Deployment**
- **Deployment Center** → Check build logs
- **Log Stream** → Watch real-time logs
- **App Service Logs** → Enable if needed

## 🔍 Troubleshooting

### Check App Status:
- Visit: `https://your-app-name.azurewebsites.net/health`
- Should return: `{"status": "ok"}`

### Common Issues:

1. **"Application Error"**
   - Check environment variables are set
   - Verify DATABASE_URL format
   - Check deployment logs

2. **Database Connection Failed**
   - Verify MySQL server allows Azure connections
   - Check CONNECTION_STRING format
   - Ensure SSL certificates are configured

3. **Container Still Failing**
   - Enable **App Service Logs**
   - Check **Log Stream** for detailed errors
   - Verify all dependencies in requirements.txt

## 🎯 Post-Deployment Verification

1. **Health Check**: `/health` returns 200 OK
2. **Login Page**: Frontend loads without errors  
3. **API Connectivity**: Login works
4. **Database**: Tickets load properly
5. **AI Features**: Work if OPENAI_API_KEY is set

## 📞 Debug Commands

### Check Environment Variables:
```bash
# In App Service SSH/Console:
env | grep -E "(DATABASE|OPENAI|FRONTEND)"
```

### Test Database Connection:
```bash
python3 -c "
import os
from sqlalchemy import create_engine, text
engine = create_engine(os.environ['DATABASE_URL'])
with engine.connect() as conn:
    result = conn.execute(text('SELECT 1'))
    print('Database OK')
"
```

---

## 🎉 Success Checklist

- [ ] No more "Application Error" page
- [ ] Health endpoint returns {"status": "ok"}
- [ ] Frontend can connect to backend
- [ ] Login works
- [ ] Tickets load
- [ ] No console errors

**Your app should now deploy successfully!** 🚀
