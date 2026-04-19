pipeline {
    agent { dockerfile true }
    stages {
        stage('Install Dependencies') {
            steps { sh 'npm install' }
        }
        stage('Build React Frontend') {
            steps { sh 'npm run build' }
        }
        stage('Compile Native Tauri Binary') {
            steps { sh 'npm run tauri build' }
        }
        stage('Archive Artifacts') {
            steps { archiveArtifacts artifacts: 'src-tauri/target/release/bundle/**/*.exe', fingerprint: true }
        }
    }
}