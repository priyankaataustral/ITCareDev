from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

# Initialize SQLAlchemy and Migrate without an app context
# They will be initialized later in the application factory
db = SQLAlchemy()
migrate = Migrate()