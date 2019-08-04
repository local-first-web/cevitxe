/** @jsx jsx */

import { CSSObject, jsx } from '@emotion/core'
import { Cevitxe } from 'cevitxe'
import debug from 'debug'
import { Field, Formik, FormikHelpers, FormikValues } from 'formik'
import { useEffect, useState, useRef } from 'react'
import Redux from 'redux'
import createPersistedState from 'use-persisted-state'
import { wordPair } from './wordPair'
import React from 'react'

//TODO ToolbarProps<T>

export const Toolbar = ({ cevitxe, onStoreReady }: ToolbarProps<any>) => {
  // Hooks

  const useDocumentId = createPersistedState(`cevitxe/${cevitxe.databaseName}/documentId`)
  const [documentId, setDocumentId] = useDocumentId()
  const input = useRef<HTMLInputElement>() as React.RefObject<HTMLInputElement>

  const [appStore, setAppStore] = useState()

  const [documentIdHasFocus, setDocumentIdHasFocus] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (documentIdHasFocus && input.current) input.current.select()
  }, [documentIdHasFocus])

  useEffect(() => {
    log('setup')
    if (documentId) join(documentId)
    else create()
  }, []) // only runs on first render

  const log = debug(`cevitxe:toolbar:${documentId}`)
  log('render')

  const create = async () => {
    setBusy(true)
    const newDocumentId = wordPair()
    setDocumentId(newDocumentId)
    const newStore = await cevitxe.createStore(newDocumentId)
    setAppStore(newStore)
    onStoreReady(newStore)
    setBusy(false)
    log('created store', newDocumentId)
    return newDocumentId
  }

  const join = async (_documentId: string) => {
    if (busy) return
    setBusy(true)
    setDocumentId(_documentId)
    const newStore = await cevitxe.joinStore(_documentId)
    setAppStore(newStore)
    onStoreReady(newStore)
    setBusy(false)
    log('joined store', _documentId)
  }

  const onSubmit = (values: FormikValues, actions: FormikHelpers<any>) => {
    join(values.documentId as string)
    actions.setSubmitting(false)
  }

  return (
    <div css={styles.toolbar}>
      {appStore && (
        <Formik initialValues={{ documentId }} onSubmit={onSubmit}>
          {({ setFieldValue, values }) => {
            const newClick = async () => setFieldValue('documentId', await create())
            const joinClick = async () => {
              setDocumentIdHasFocus(false)
              join(values.documentId)
            }
            const itemClick = (documentId: string) => () => {
              setFieldValue('documentId', documentId)
              setDocumentId(documentId)
              join(documentId)
              setDocumentIdHasFocus(false)
            }
            const inputFocus = (e: Event) => {
              if (e && e.target) {
                const input = e.target as HTMLInputElement
                input.select()
              }
              setDocumentIdHasFocus(true)
            }
            return (
              <React.Fragment>
                <div css={styles.toolbarGroup}>
                  <div css={styles.menuWrapper}>
                    <Field type="text" name="documentId" css={styles.input} onFocus={inputFocus} />
                    <div css={{ ...menu(documentIdHasFocus) }}>
                      {cevitxe.knownDocumentIds.map(documentId => (
                        <button
                          key={documentId}
                          role="button"
                          type="button"
                          onClick={itemClick(documentId)}
                          css={styles.menuItem}
                        >
                          {documentId}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button role="button" type="button" onClick={joinClick} css={styles.button}>
                    Join
                  </button>
                </div>
                <div css={styles.toolbarGroup}>
                  <button role="button" type="button" onClick={newClick} css={styles.button}>
                    New
                  </button>
                </div>
                <div css={styles.toolbarGroup}>{busy ? 'busy' : 'idle'}</div>
                <div css={styles.toolbarGroup}>{cevitxe.connectionCount}</div>
              </React.Fragment>
            )
          }}
        </Formik>
      )}
    </div>
  )
}

export interface ToolbarProps<T> {
  cevitxe: Cevitxe<T>
  onStoreReady: (store: Redux.Store) => void
}

const menu = (documentIdHasFocus: boolean) =>
  ({
    display: documentIdHasFocus ? 'block' : 'none',
    position: 'absolute',
    background: 'white',
    top: 30,
  } as CSSObject)

const fontFamily = 'inconsolata, monospace'
const button: CSSObject = {
  background: 'white',
  border: '1px solid #ddd',
  padding: '.3em 1em',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily,
  fontSize: 14,
  ':hover': {
    background: 'lightBlue',
  },
}

type Stylesheet = { [k: string]: CSSObject | ((...props: any[]) => CSSObject) }
const styles: Stylesheet = {
  toolbar: {
    background: '#eee',
    borderBottom: '1px solid #ddd',
    display: 'flex',
    flexGrow: 0,
    alignItems: 'center',
    fontFamily,
    fontSize: 14,
    position: 'relative',
    zIndex: 9,
  },
  button: {
    ...button,
    margin: '0 5px',
    borderRadius: 3,
    textTransform: 'uppercase',
  },
  input: {
    marginRight: 5,
    padding: '.3em 1em',
    border: '1px solid #eee',
    borderRadius: '3px',
    ['::placeholder']: {
      fontStyle: 'normal!important',
    },
    height: 16,
    width: 150,
    fontFamily,
    fontSize: 14,
  },
  toolbarGroup: {
    borderRight: '1px solid #eee',
    padding: 10,
  },
  menuWrapper: {
    position: 'relative',
    display: 'inline-block',
  },
  menuItem: {
    ...button,
    display: 'block',
    marginTop: -2,
    width: 200,
    height: 30,
  },
}
