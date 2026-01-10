import { decryptToken, hashToken } from './lib/encryption'

// PASTE YOUR ENCRYPTED TOKEN HERE
const encryptedToken = '8e2265bb22b0763855489221:88068c5290f826ae1aba3397b4ca4698:5a23572294971544ce5b58ffd4cfce8d25cc50905e10d94d13eab9a131af12a8ae15f37d6692764f1f4deca8cb9d7ac3'

try {
    const decrypted = decryptToken(encryptedToken)
    console.log('Decrypted Token:', decrypted)

    const hash = hashToken(decrypted)
    console.log('Decrypted Token Hash:', hash)
} catch (error) {
    console.error('Error:', error)
}
